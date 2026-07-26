package com.meetyoulive.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#0f0821"));
        window.setNavigationBarColor(Color.parseColor("#0f0821"));
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        manager.createNotificationChannel(new NotificationChannel(
            "messages",
            "Mensajes",
            NotificationManager.IMPORTANCE_HIGH
        ));
        manager.createNotificationChannel(new NotificationChannel(
            "matches",
            "Matches",
            NotificationManager.IMPORTANCE_DEFAULT
        ));
        manager.createNotificationChannel(new NotificationChannel(
            "calls",
            "Llamadas",
            NotificationManager.IMPORTANCE_HIGH
        ));
        manager.createNotificationChannel(new NotificationChannel(
            "lives",
            "Lives",
            NotificationManager.IMPORTANCE_DEFAULT
        ));
        manager.createNotificationChannel(new NotificationChannel(
            "account_payments",
            "Cuenta y pagos",
            NotificationManager.IMPORTANCE_DEFAULT
        ));
    }
}
