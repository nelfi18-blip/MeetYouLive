import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
let directory;
const passed=[];
const fixtures={
  "android/view/WindowManager.java":`package android.view; public interface WindowManager { class LayoutParams { public static final int FLAG_SECURE=8192; public int flags; } }`,
  "android/view/Window.java":`package android.view; public class Window {
    public final WindowManager.LayoutParams attributes=new WindowManager.LayoutParams();
    public boolean ignore,failSet,failClear,failRead;
    public void setFlags(int flags,int mask){if(failSet)throw new IllegalStateException();if(!ignore)attributes.flags=(attributes.flags&~mask)|(flags&mask);}
    public void clearFlags(int flags){if(failClear)throw new IllegalStateException();if(!ignore)attributes.flags &= ~flags;}
    public WindowManager.LayoutParams getAttributes(){if(failRead)throw new IllegalStateException();return attributes;}
  }`,
  "android/app/Activity.java":`package android.app; import java.util.*; import android.view.Window; public class Activity {
    public static boolean uiThread; public Window window=new Window();public boolean finishing,destroyed,failSchedule,failWindow;
    private final Queue<Runnable> queue=new ArrayDeque<>();
    public void runOnUiThread(Runnable r){if(failSchedule)throw new IllegalStateException();queue.add(r);}
    public Window getWindow(){if(failWindow)throw new IllegalStateException();return window;}
    public boolean isFinishing(){return finishing;} public boolean isDestroyed(){return destroyed;}
    public void drain(){uiThread=true;try{while(!queue.isEmpty())queue.remove().run();}finally{uiThread=false;}}
  }`,
  "com/getcapacitor/Plugin.java":`package com.getcapacitor; import android.app.Activity; public class Plugin { public static Activity activity; public Activity getActivity(){return activity;} }`,
  "com/getcapacitor/PluginCall.java":`package com.getcapacitor; import android.app.Activity; public class PluginCall {
    public int resolved,rejected,flagsAtResolve; public String code;
    public void resolve(){if(!Activity.uiThread)throw new IllegalStateException("ack outside UI thread");resolved++;flagsAtResolve=Plugin.activity.window.attributes.flags;}
    public void reject(String message,String errorCode){rejected++;code=errorCode;}
  }`,
  "com/getcapacitor/PluginMethod.java":`package com.getcapacitor; public @interface PluginMethod {}`,
  "com/getcapacitor/annotation/CapacitorPlugin.java":`package com.getcapacitor.annotation; public @interface CapacitorPlugin { String name(); }`,
  "Contract.java":`import android.app.Activity;import android.view.*;import com.getcapacitor.*;import com.meetyoulive.app.ScreenSecurityPlugin;
  public class Contract {
    static final int SECURE=WindowManager.LayoutParams.FLAG_SECURE;
    static void check(boolean value,String reason){if(!value)throw new AssertionError(reason);}
    static void success(PluginCall c,boolean enabled){check(c.resolved==1&&c.rejected==0,"exactly one success");check(((c.flagsAtResolve&SECURE)!=0)==enabled,"verified bit must precede acknowledgement");}
    static void failure(PluginCall c,String code){check(c.resolved==0&&c.rejected==1,"no false success");check(code.equals(c.code),"stable failure code");}
    public static void main(String[] args){
      String scenario=args[0];Activity a=new Activity();Plugin.activity=a;ScreenSecurityPlugin p=new ScreenSecurityPlugin();PluginCall c=new PluginCall();
      boolean disable=scenario.equals("disable")||scenario.equals("ignore-disable")||scenario.equals("throw-clear");
      if(disable)a.window.attributes.flags=SECURE|16;
      switch(scenario){
        case "missing-activity":Plugin.activity=null;break;
        case "missing-window":a.window=null;break;
        case "finishing":a.finishing=true;break;
        case "destroyed":a.destroyed=true;break;
        case "ignore-enable":case "ignore-disable":a.window.ignore=true;break;
        case "throw-set":a.window.failSet=true;break;
        case "throw-clear":a.window.failClear=true;break;
        case "throw-read":a.window.failRead=true;break;
        case "throw-window":a.failWindow=true;break;
        case "throw-schedule":a.failSchedule=true;break;
        case "preserve":a.window.attributes.flags=16;break;
      }
      if(disable)p.disable(c);else p.enable(c);
      check(c.resolved==0,"must wait for UI Runnable");
      if(scenario.equals("replaced"))Plugin.activity=new Activity();
      if(scenario.equals("finish-after-enqueue"))a.finishing=true;
      if(scenario.equals("destroy-after-enqueue"))a.destroyed=true;
      Window previous=a.window;
      if(scenario.equals("window-replaced"))a.window=new Window();
      PluginCall second=new PluginCall();
      if(scenario.equals("repeat"))p.enable(second);
      if(scenario.equals("queued-order"))p.disable(second);
      a.drain();
      if(scenario.startsWith("missing-")||scenario.equals("finishing")||scenario.equals("destroyed")||scenario.equals("replaced")||scenario.contains("after-enqueue"))failure(c,"SCREEN_SECURITY_UNAVAILABLE");
      else if(scenario.startsWith("ignore-"))failure(c,"SCREEN_SECURITY_VERIFY_FAILED");
      else if(scenario.startsWith("throw-"))failure(c,"SCREEN_SECURITY_FAILED");
      else {
        success(c,!disable);
        if(scenario.equals("preserve")||disable)check((a.window.attributes.flags&16)!=0,"must preserve unrelated flags");
        if(scenario.equals("repeat"))success(second,true);
        if(scenario.equals("queued-order")){success(second,false);check((a.window.attributes.flags&SECURE)==0,"latest requested state wins");}
        if(scenario.equals("window-replaced"))check(previous.attributes.flags==0,"must act on current Window");
        if(scenario.equals("retry")){a.window.ignore=true;PluginCall bad=new PluginCall();p.disable(bad);a.drain();failure(bad,"SCREEN_SECURITY_VERIFY_FAILED");a.window.ignore=false;PluginCall retry=new PluginCall();p.disable(retry);a.drain();success(retry,false);}
      }
      System.out.println("verified "+scenario);
    }
  }`,
};
before(async()=>{
  directory=await mkdtemp(path.join(tmpdir(),"screen-security-java-"));
  const paths=[];
  for(const [name,source]of Object.entries(fixtures)){const file=path.join(directory,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,source);paths.push(file);}
  const plugin=path.join(root,"frontend/android/app/src/main/java/com/meetyoulive/app/ScreenSecurityPlugin.java");
  const compilerJar=process.env.CAPTURE_JAVA_COMPILER_JAR;
  execFileSync(compilerJar ? "java" : "javac",[...(compilerJar ? ["-jar",compilerJar,"-21"] : ["--release","21"]),"-d",directory,...paths,plugin],{stdio:"pipe"});
});
after(async()=>{
  if(directory)await rm(directory,{recursive:true,force:true});
  const folder="/tmp/capture-browser-artifacts";await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,"native-contract.json"),JSON.stringify({scope:"Actual Java plugin compiled/executed against controlled Android/Capacitor API doubles; no APK or Android OS",passed},null,2));
});
for(const scenario of ["enable","disable","preserve","repeat","missing-activity","missing-window","finishing","destroyed","replaced","finish-after-enqueue","destroy-after-enqueue","ignore-enable","ignore-disable","throw-set","throw-clear","throw-read","throw-window","throw-schedule","retry","queued-order","window-replaced"])
  test(`native Java FLAG_SECURE contract: ${scenario}`,()=>{assert.equal(execFileSync("java",["-cp",directory,"Contract",scenario],{encoding:"utf8"}).trim(),"verified "+scenario);passed.push(scenario);});
test("this PR cannot automatically package APK/AAB; manual workflows remain separate",async()=>{
  for(const file of ["android-debug-apk","android-release-apk","android-release-aab"]){
    const source=await readFile(path.join(root,`.github/workflows/${file}.yml`),"utf8");
    assert.match(source,/if: \$\{\{ github.event_name != 'pull_request' \|\| github.head_ref != 'fix\/android-sensitive-screen-capture' \}\}/);
  }
});
