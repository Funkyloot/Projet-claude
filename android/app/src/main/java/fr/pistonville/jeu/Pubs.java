package fr.pistonville.jeu;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Publicités récompensées (AdMob), toujours au choix du joueur : on ne les
 * montre que quand il touche un bouton « bonus vidéo ». Avant toute
 * publicité, on demande le consentement là où la loi l'exige (Europe,
 * formulaire Google UMP).
 */
final class Pubs {
    interface Fin { void apres(boolean recompense); }

    private final Activity activite;
    private final ConsentInformation consentement;
    private final AtomicBoolean demarre = new AtomicBoolean(false);
    private RewardedAd pub;
    private boolean chargement;

    Pubs(Activity activite) {
        this.activite = activite;
        consentement = UserMessagingPlatform.getConsentInformation(activite);
    }

    /** Au lancement : formulaire de consentement si nécessaire, puis chargement d'une publicité. */
    void lancer() {
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consentement.requestConsentInfoUpdate(activite, params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activite, erreur -> demarrer()),
                erreur -> demarrer());
        if (consentement.canRequestAds()) demarrer();
    }

    private void demarrer() {
        if (!consentement.canRequestAds() || demarre.getAndSet(true)) return;
        new Thread(() -> {
            MobileAds.initialize(activite, etat -> {});
            activite.runOnUiThread(this::charger);
        }).start();
    }

    private void charger() {
        if (pub != null || chargement || !demarre.get()) return;
        chargement = true;
        RewardedAd.load(activite, activite.getString(R.string.pub_recompensee), new AdRequest.Builder().build(),
                new RewardedAdLoadCallback() {
                    @Override public void onAdLoaded(@NonNull RewardedAd p) { pub = p; chargement = false; }
                    @Override public void onAdFailedToLoad(@NonNull LoadAdError e) { pub = null; chargement = false; }
                });
    }

    boolean prete() { return pub != null; }

    void montrer(Fin fin) {
        if (pub == null) { fin.apres(false); charger(); return; }
        final RewardedAd p = pub;
        pub = null;
        final boolean[] gagne = { false };
        p.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() { fin.apres(gagne[0]); charger(); }
            @Override public void onAdFailedToShowFullScreenContent(@NonNull com.google.android.gms.ads.AdError e) { fin.apres(false); charger(); }
        });
        p.show(activite, recompense -> gagne[0] = true);
    }

    /** Le joueur doit pouvoir revoir son choix (bouton dans les paramètres du jeu). */
    boolean choixModifiable() {
        return consentement.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    void revoirChoix() {
        UserMessagingPlatform.showPrivacyOptionsForm(activite, erreur -> demarrer());
    }
}
