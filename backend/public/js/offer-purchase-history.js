(() => {
    const list = document.getElementById('offer-purchases-list');
    if (!list) return;
    const status = document.getElementById('offer-purchases-status');
    const more = document.getElementById('offer-purchases-more');
    const format = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'long', timeStyle: 'short' });
    let cursor = null;

    async function load() {
        more.disabled = true;
        status.textContent = 'Chargement des achats…';
        try {
            const response = await fetch('/api/purchase/offer/history' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
            if (!response.ok) throw new Error();
            const { purchases, next } = await response.json();
            const labels = {
                timed_wallet_completed: 'Payé', timed_admin_authorized: 'Accès accordé',
                wallet_completed: 'Payé', admin_authorized: 'Accès accordé',
                pending: 'En attente', refunded: 'Remboursé', cancelled: 'Annulé', expired: 'Expiré'
            };
            for (const purchase of purchases) {
                const item = document.createElement('li');
                const expiry = purchase.expires_at
                    ? 'Fin d’accès : ' + format.format(new Date(purchase.expires_at)) + ' (Tunis)'
                    : 'Conditions d’accès d’origine';
                item.textContent = purchase.title + ' · ' + purchase.amount + ' DT · ' + (labels[purchase.status] ?? purchase.status) + ' · ' + expiry;
                list.append(item);
            }
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
