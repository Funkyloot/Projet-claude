package fr.pistonville.jeu;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

/**
 * Pistonville : tout le jeu est une page HTML rangée dans les assets de
 * l'application et affichée plein écran dans une WebView. La partie est
 * gardée dans le stockage local de la WebView, sur le téléphone. Internet ne
 * sert qu'aux publicités récompensées (facultatives) et au Pack du fondateur,
 * que la page demande par l'objet JavaScript « PistonvilleAndroid ».
 *
 * La page est servie à l'adresse https://appassets.androidplatform.net/ (et
 * non file://) pour que le stockage local, le son et le canvas se comportent
 * comme dans un navigateur.
 */
public class MainActivity extends Activity {
    private static final String ADRESSE = "https://appassets.androidplatform.net/assets/index.html";
    private WebView vue;
    private Pubs pubs;
    private Achats achats;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final WebViewAssetLoader chargeur = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        vue = new WebView(this);
        vue.setBackgroundColor(Color.rgb(20, 16, 34));
        vue.setOverScrollMode(View.OVER_SCROLL_NEVER);
        vue.setVerticalScrollBarEnabled(false);
        vue.setHorizontalScrollBarEnabled(false);
        WebSettings reglages = vue.getSettings();
        reglages.setJavaScriptEnabled(true);
        reglages.setDomStorageEnabled(true);                    // la sauvegarde (localStorage)
        reglages.setMediaPlaybackRequiresUserGesture(false);    // la musique démarre au premier toucher
        reglages.setAllowFileAccess(false);
        reglages.setAllowContentAccess(false);
        reglages.setTextZoom(100);                              // la taille du texte système ne déforme pas le jeu
        vue.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest requete) {
                return chargeur.shouldInterceptRequest(requete.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest requete) {
                // Le jeu ne quitte jamais sa page.
                Uri adresse = requete.getUrl();
                return !"appassets.androidplatform.net".equals(adresse.getHost());
            }
        });
        pubs = new Pubs(this);
        achats = new Achats(this, () -> versLeJeu("fondateur", "true"));
        vue.addJavascriptInterface(new Pont(), "PistonvilleAndroid");
        setContentView(vue);
        pleinEcran();
        pubs.lancer();
        achats.lancer();

        if (etat != null) vue.restoreState(etat);
        else vue.loadUrl(ADRESSE);

        // Bouton (ou geste) retour : le jeu met en pause ou referme son écran ;
        // s'il n'y a plus rien à fermer, l'appli passe en arrière-plan.
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::retour);
        }
    }

    /** Un message pour le jeu : window.pistonville.evenementAndroid(type, valeur). */
    private void versLeJeu(String type, String valeur) {
        runOnUiThread(() -> vue.evaluateJavascript(
                "window.pistonville && window.pistonville.evenementAndroid('" + type + "', " + valeur + ")", null));
    }

    /** Ce que la page du jeu peut demander à l'application. */
    private final class Pont {
        @JavascriptInterface public boolean pubPrete() { return pubs.prete(); }
        @JavascriptInterface public void montrerPub() {
            runOnUiThread(() -> pubs.montrer(gagne -> versLeJeu("pub", gagne ? "true" : "false")));
        }
        @JavascriptInterface public String prixFondateur() { return achats.prix(); }
        @JavascriptInterface public void acheterFondateur() { achats.acheter(); }
        @JavascriptInterface public boolean confidentialiteRequise() { return pubs.choixModifiable(); }
        @JavascriptInterface public void ouvrirConfidentialite() { runOnUiThread(() -> pubs.revoirChoix()); }
    }

    private void retour() {
        vue.evaluateJavascript(
                "(function(){try{return !!(window.pistonville&&window.pistonville.boutonRetour());}catch(e){return false;}})()",
                resultat -> { if (!"true".equals(resultat)) moveTaskToBack(true); });
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        retour();   // Android 12 et avant
    }

    /** Plein écran : barres du système cachées, réapparaissent d'un glissement. */
    @SuppressWarnings("deprecation")
    private void pleinEcran() {
        Window fenetre = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            fenetre.setDecorFitsSystemWindows(false);
            WindowInsetsController c = fenetre.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            fenetre.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) pleinEcran();
    }

    // En arrière-plan, le jeu se met en pause (il sauvegarde et coupe le son lui-même).
    @Override
    protected void onPause() {
        super.onPause();
        vue.onPause();
        vue.pauseTimers();
    }

    @Override
    protected void onResume() {
        super.onResume();
        vue.resumeTimers();
        vue.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle etat) {
        super.onSaveInstanceState(etat);
        vue.saveState(etat);
    }

    @Override
    protected void onDestroy() {
        vue.destroy();
        super.onDestroy();
    }
}
