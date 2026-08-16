package com.meetyoulive.app;

import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * TEMP DIAGNOSTIC utility for the ongoing Google Sign-In investigation.
 *
 * A single append-only, in-memory event log shared by {@link MainActivity}
 * (plugin registration / Capacitor bridge checks) and
 * {@link NativeGoogleAuthPlugin} (end-to-end sign-in attempt lifecycle), so
 * that a single {@code Activity.dump()} override can expose the complete
 * diagnostic trail in a Full Bug Report - including "Take bug report" reports
 * generated minutes after the events happened, once the logcat ring buffer
 * has already rotated the original Log.d/Log.w/Log.e lines out.
 *
 * Strictly observational: only stage names, booleans and exception class
 * names are recorded here. Never store the real Google web client ID, ID
 * tokens, email, name or any other PII/secret.
 *
 * Safe to delete this whole class (and its call sites) once Google Sign-In
 * registration/end-to-end behavior is confirmed and this diagnostic is no
 * longer needed.
 */
final class NativeGoogleAuthDiag {
    private static final List<String> EVENTS = Collections.synchronizedList(new ArrayList<String>());
    private static final SimpleDateFormat TIME_FORMAT =
        new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US);

    private NativeGoogleAuthDiag() {
    }

    static void record(String message) {
        synchronized (EVENTS) {
            EVENTS.add(TIME_FORMAT.format(new Date()) + " " + message);
        }
    }

    static void dumpRecordedEvents(String prefix, PrintWriter writer, String tag) {
        writer.println(prefix + tag + ": --- recorded events (registration + sign-in attempts) ---");
        synchronized (EVENTS) {
            for (String event : EVENTS) {
                writer.println(prefix + tag + ": " + event);
            }
        }
    }
}
