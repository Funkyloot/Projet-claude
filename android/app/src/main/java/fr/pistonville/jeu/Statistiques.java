package fr.pistonville.jeu;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;

import androidx.preference.PreferenceManager;

import com.google.firebase.FirebaseApp;
import com.google.firebase.analytics.FirebaseAnalytics;

import org.json.JSONObject;

import java.util.EnumMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Statistiques de jeu (Google Analytics pour Firebase). Actives seulement si
 * l'appli a été construite avec android/app/google-services.json ; sinon,
 * tout est ignoré. Le consentement suit le choix fait dans le formulaire
 * Google (UMP, chaîne TCF) quand la loi l'exige, et le joueur peut couper les
 * statistiques dans les paramètres du jeu.
 */
final class Statistiques {
    private final Context contexte;
    private final FirebaseAnalytics analytics;

    Statistiques(Context contexte) {
        this.contexte = contexte;
        analytics = FirebaseApp.getApps(contexte).isEmpty() ? null : FirebaseAnalytics.getInstance(contexte);
    }

    boolean actives() { return analytics != null; }

    void evenement(String nom, String json) {
        if (analytics == null) return;
        Bundle b = new Bundle();
        try {
            JSONObject o = new JSONObject(json);
            for (Iterator<String> it = o.keys(); it.hasNext(); ) {
                String k = it.next();
                Object v = o.get(k);
                if (v instanceof Integer || v instanceof Long) b.putLong(k, ((Number) v).longValue());
                else if (v instanceof Number) b.putDouble(k, ((Number) v).doubleValue());
                else b.putString(k, String.valueOf(v));
            }
        } catch (Exception ignore) { /* paramètres illisibles : l'événement part sans eux */ }
        analytics.logEvent(nom, b);
    }

    void activer(boolean oui) {
        if (analytics != null) analytics.setAnalyticsCollectionEnabled(oui);
    }

    /**
     * Après le formulaire de consentement : lit la chaîne TCF écrite par UMP.
     * Hors Europe (RGPD non applicable), tout est accordé ; en Europe, la
     * mesure suit la finalité 1 (stocker des informations sur l'appareil) et la
     * publicité personnalisée les finalités 3 et 4.
     */
    void appliquerConsentement() {
        if (analytics == null) return;
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(contexte);
        boolean rgpd = prefs.getInt("IABTCF_gdprApplies", 0) == 1;
        String finalites = prefs.getString("IABTCF_PurposeConsents", "");
        boolean stockage = !rgpd || finalite(finalites, 1);
        boolean perso = !rgpd || (finalite(finalites, 3) && finalite(finalites, 4));
        Map<FirebaseAnalytics.ConsentType, FirebaseAnalytics.ConsentStatus> c = new EnumMap<>(FirebaseAnalytics.ConsentType.class);
        c.put(FirebaseAnalytics.ConsentType.ANALYTICS_STORAGE, stockage ? FirebaseAnalytics.ConsentStatus.GRANTED : FirebaseAnalytics.ConsentStatus.DENIED);
        c.put(FirebaseAnalytics.ConsentType.AD_STORAGE, stockage ? FirebaseAnalytics.ConsentStatus.GRANTED : FirebaseAnalytics.ConsentStatus.DENIED);
        c.put(FirebaseAnalytics.ConsentType.AD_USER_DATA, perso ? FirebaseAnalytics.ConsentStatus.GRANTED : FirebaseAnalytics.ConsentStatus.DENIED);
        c.put(FirebaseAnalytics.ConsentType.AD_PERSONALIZATION, perso ? FirebaseAnalytics.ConsentStatus.GRANTED : FirebaseAnalytics.ConsentStatus.DENIED);
        analytics.setConsent(c);
    }

    private static boolean finalite(String chaine, int n) {
        return chaine.length() >= n && chaine.charAt(n - 1) == '1';
    }
}
