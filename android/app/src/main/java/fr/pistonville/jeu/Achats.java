package fr.pistonville.jeu;

import android.app.Activity;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.Collections;
import java.util.List;

/**
 * Le Pack du fondateur : un achat unique (produit « fondateur » créé dans la
 * Play Console, non consommable). Au lancement, on retrouve un achat déjà
 * fait sur le compte Google (réinstallation, autre téléphone).
 */
final class Achats {
    interface Possede { void fondateur(); }

    private final Activity activite;
    private final Possede possede;
    private final String produit;
    private BillingClient client;
    private ProductDetails details;

    Achats(Activity activite, Possede possede) {
        this.activite = activite;
        this.possede = possede;
        this.produit = activite.getString(R.string.produit_fondateur);
    }

    void lancer() {
        client = BillingClient.newBuilder(activite)
                .setListener((resultat, achats) -> { if (achats != null) traiter(achats); })
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
                retrouver();
                chercherDetails();
            }
            @Override public void onBillingServiceDisconnected() { }
        });
    }

    private void retrouver() {
        client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (r, achats) -> traiter(achats));
    }

    private void chercherDetails() {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(produit).setProductType(BillingClient.ProductType.INAPP).build()))
                .build();
        client.queryProductDetailsAsync(params, (r, resultat) -> {
            List<ProductDetails> liste = resultat.getProductDetailsList();
            if (!liste.isEmpty()) details = liste.get(0);
        });
    }

    /** Prix affiché par Google Play dans la monnaie du joueur (« 4,00 € »), ou null. */
    String prix() {
        ProductDetails d = details;
        if (d == null || d.getOneTimePurchaseOfferDetails() == null) return null;
        return d.getOneTimePurchaseOfferDetails().getFormattedPrice();
    }

    void acheter() {
        if (client == null || details == null) return;
        BillingFlowParams params = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).build()))
                .build();
        activite.runOnUiThread(() -> client.launchBillingFlow(activite, params));
    }

    private void traiter(List<Purchase> achats) {
        for (Purchase a : achats) {
            if (!a.getProducts().contains(produit) || a.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            // Un achat non confirmé sous 3 jours est remboursé par Google : on le confirme.
            if (!a.isAcknowledged()) {
                client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(a.getPurchaseToken()).build(), r -> { });
            }
            possede.fondateur();
        }
    }
}
