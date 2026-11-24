(() => {
    const list = document.getElementById('offer-purchases-list');
    if (!list) return;
    const status = document.getElementById('offer-purchases-status');
    const more = document.getElementById('offer-purchases-more');
    const format = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'long', timeStyle: 'short' });
    const labels = {
        timed_wallet_completed: 'Payé', timed_admin_authorized: 'Accès accordé',
        wallet_completed: 'Payé', admin_authorized: 'Accès accordé',
        pending: 'En attente', refunded: 'Remboursé', cancelled: 'Annulé', expired: 'Expiré',
        scheduled_offer: 'Accès accordé'
    };
    // Colour of the status badge: green = access granted, amber = waiting, red = money or access lost.
    const toneFor = purchase => {
        if (purchase.payment_reversed_at || ['refunded', 'cancelled'].includes(purchase.status)) return 'is-danger';
        if (purchase.status === 'pending') return 'is-warn';
        if (purchase.status === 'expired') return '';
        return 'is-ok';
    };
    let cursor = null;

    function purchaseCard(purchase) {
        const item = document.createElement('li');
        item.className = 'offer-purchase';

        const top = document.createElement('div');
        top.className = 'offer-purchase-top';
        const title = document.createElement('h3');
        title.className = 'offer-purchase-title';
        title.textContent = purchase.title;
        const badge = document.createElement('span');
        badge.className = ('offer-status ' + toneFor(purchase)).trim();
        badge.textContent = purchase.payment_reversed_at ? 'Paiement initial contrepassé' : labels[purchase.status] ?? purchase.status;
        top.append(title, badge);

        const expiry = purchase.expires_at
            ? 'Fin d’accès : ' + format.format(new Date(purchase.expires_at)) + ''
            : 'Conditions d’accès d’origine';
        const meta = document.createElement('p');
        meta.className = 'offer-purchase-meta';
        meta.textContent = [purchase.amount + ' DT',
            purchase.external_paid_on && 'Payé le ' + purchase.external_paid_on,
            purchase.upgrade_credit != null && 'Crédit : ' + purchase.upgrade_credit + ' DT',
            purchase.installment_remaining != null && 'Solde : ' + purchase.installment_remaining + ' DT', expiry].filter(Boolean).join(' · ');

        item.append(top, meta);

        const rows = (purchase.schedule || []).filter(row => row.remaining !== '0.00');
        if (rows.length) {
            const tranches = document.createElement('ol');
            tranches.className = 'offer-tranches';
            tranches.setAttribute('aria-label', 'Échéancier');
            for (const row of rows) {
                const detail = document.createElement('li');
                detail.textContent = 'Tranche ' + row.position + ' · ' + row.remaining + ' DT · ' + (row.dueDate || 'Aucune échéance définie');
                tranches.append(detail);
            }
            item.append(tranches);
        }

        const nextTranche = purchase.schedule?.find(row => row.remaining !== '0.00');
        if (purchase.arrangement_id && nextTranche) {
            const pay = document.createElement('button');
            pay.type = 'button';
            pay.className = 'offer-pay-button';
            pay.textContent = 'Payer la prochaine tranche · ' + nextTranche.remaining + ' DT';
            const requestId = crypto.randomUUID();
            pay.addEventListener('click', async () => {
                if (!confirm('Payer ' + nextTranche.remaining + ' DT depuis ton portefeuille ?')) return;
                pay.disabled = true;
                try {
                    const response = await fetch('/api/purchase/offer-installments/' + encodeURIComponent(purchase.arrangement_id) + '/pay', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount: nextTranche.remaining, position: nextTranche.position, requestId })
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Paiement indisponible.');
                    window.location.reload();
                } catch (error) {
                    status.textContent = error.message;
                    pay.disabled = false;
                }
            });
            item.append(pay);
        }
        return item;
    }

    async function load() {
        more.disabled = true;
        status.textContent = 'Chargement des achats…';
        try {
            const response = await fetch('/api/purchase/offer/history' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
            if (!response.ok) throw new Error();
            const { purchases, next } = await response.json();
            for (const purchase of purchases) list.append(purchaseCard(purchase));
            cursor = next;
            more.textContent = 'Voir plus';
            more.hidden = !cursor;
            status.textContent = list.children.length ? '' : 'Aucun achat d’offre.';
        } catch {
            status.textContent = 'Impossible de charger les achats.';
            more.textContent = 'Réessayer';
            more.hidden = false;
        } finally {
            more.disabled = false;
        }
    }
    more.addEventListener('click', load);
    load();
})();
