(() => {
    async function request(url, body) {
        const response = await fetch(url, {
            credentials: 'include',
            ...(body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        });
        const result = await response.json();
        if (!response.ok || result.success === false) throw new Error(result.error || 'Opération indisponible.');
        return result;
    }

    window.openScheduledOfferCheckout = async function (offer, adminStudentId = null) {
        const root = adminStudentId ? '/api/admin/student/' + encodeURIComponent(adminStudentId) + '/offer-upgrade' : '/api/purchase/offer-upgrade';
        const dialog = document.createElement('dialog');
        dialog.style.cssText = 'width:min(92vw,34rem);max-height:85dvh;overflow:auto;padding:1.25rem;border:1px solid #dce6ef;border-radius:16px;color:#062c40';
        dialog.innerHTML = '<form><h2></h2><label>Offre source <select name="source"><option value="">Sans crédit</option></select></label><br>' +
            '<label>Nombre de paiements <select name="count"></select></label><p role="status"></p><div data-quote></div>' +
            '<button type="submit">Afficher le devis</button> <button type="button" data-reset hidden>Nouveau devis</button> ' +
            '<button type="button" data-close>Fermer</button></form>';
        document.body.appendChild(dialog);
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        const form = dialog.querySelector('form');
        const status = form.querySelector('[role=status]');
        const quoteArea = form.querySelector('[data-quote]');
        const submit = form.querySelector('[type=submit]');
        const refresh = form.querySelector('[data-reset]');
        form.querySelector('h2').textContent = offer.title;
        form.querySelector('[data-close]').onclick = () => dialog.close();
        for (let count = 1; count <= (offer.installment_max || 1); count++) {
            form.elements.count.add(new Option(String(count), String(count)));
        }
        dialog.showModal();
        let currentQuote;
        function reset() {
            currentQuote = null;
            quoteArea.replaceChildren();
            submit.textContent = 'Afficher le devis';
            refresh.hidden = true;
            status.textContent = '';
        }
        refresh.onclick = reset;
        form.elements.source.onchange = reset;
        form.elements.count.onchange = reset;
        form.onsubmit = async event => {
            event.preventDefault();
            if (submit.disabled) return;
            submit.disabled = true;
            refresh.disabled = true;
            status.textContent = '';
            form.elements.source.disabled = true;
            form.elements.count.disabled = true;
            try {
                if (currentQuote) {
                    await request(root + '/confirm', {
                        quote: currentQuote.quote, requestId: currentQuote.requestId,
                        acceptSourceDebt: form.elements.acceptDebt?.checked === true,
                        ...(adminStudentId && Number(currentQuote.dueNow) > 0 && { source: 'external',
                            externalConfirmed: form.elements.verified.checked, paidOn: form.elements.paidOn.value,
                            receiptReference: form.elements.receipt.value })
                    });
                    dialog.close();
                    if (adminStudentId) await window.openStudentDetailsModal(adminStudentId);
                    else window.location.href = '/app/paiement';
                    return;
                }
                currentQuote = await request(root + '/quote', { targetId: offer.id,
                    sourceId: form.elements.source.value || null, count: Number(form.elements.count.value) });
                const q = currentQuote;
                const summary = document.createElement('p');
                const tunisDate = new Intl.DateTimeFormat('fr-FR', {
                    timeZone: 'Africa/Tunis', dateStyle: 'long', timeStyle: 'short'
                });
                const cutoffDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' });
                const days = Math.floor(q.remainingMinutes / 1440);
                const hours = Math.floor(q.remainingMinutes % 1440 / 60);
                const duration = [days && days + ' j', hours && hours + ' h', q.remainingMinutes % 60 + ' min'].filter(Boolean).join(' ');
                summary.textContent = 'Prix : ' + q.price + ' DT · Crédit : ' + q.credit + ' DT · À payer maintenant : ' +
                    q.dueNow + ' DT · Solde annuel : ' + q.remaining + ' DT. Année scolaire ' + q.academicYear + '–' +
                    (q.academicYear + 1) + '. Dernier jour inclus : ' + cutoffDate.format(new Date(q.cutoff + 'T00:00:00Z')) +
                    '. Fin d’accès : ' + tunisDate.format(new Date(q.expires_at)) + ' (Tunis). Accès restant : environ ' + duration + '.';
                quoteArea.append(summary);
                const list = document.createElement('ol');
                for (const row of q.schedule) {
                    const item = document.createElement('li');
                    item.textContent = row.amount + ' DT · Reste ' + row.remaining + ' DT · ' +
                        (row.dueDate ? cutoffDate.format(new Date(row.dueDate + 'T00:00:00Z')) : 'Aucune échéance définie');
                    list.append(item);
                }
                quoteArea.append(list);
                if (q.sourceDebt !== '0.00') {
                    const debt = document.createElement('p');
                    debt.textContent = 'Dette de l’offre source : ' + q.sourceDebt + ' DT. Solde de l’offre annuelle : ' + q.remaining + ' DT.';
                    quoteArea.append(debt);
                    const acknowledgement = document.createElement('label');
                    acknowledgement.innerHTML = '<input name="acceptDebt" type="checkbox" required> Je confirme que les deux obligations restent payables.';
                    quoteArea.append(acknowledgement);
                }
                if (adminStudentId && Number(q.dueNow) > 0) {
                    const external = document.createElement('fieldset');
                    external.innerHTML = '<legend>Paiement externe</legend><label>Date réelle <input name="paidOn" type="date" required></label><br>' +
                        '<label>Référence <input name="receipt" minlength="3" maxlength="120" required></label><br>' +
                        '<label><input name="verified" type="checkbox" required> Paiement vérifié</label>';
                    quoteArea.append(external);
                }
                submit.textContent = 'Confirmer';
                refresh.hidden = false;
            } catch (error) {
                status.textContent = error.message;
            } finally {
                submit.disabled = false;
                refresh.disabled = false;
                form.elements.source.disabled = false;
                form.elements.count.disabled = false;
            }
        };
        if (offer.upgrades_enabled) {
            try {
                const { sources } = await request(root + '/' + encodeURIComponent(offer.id) + '/sources');
                for (const source of sources) form.elements.source.add(new Option(source.title, source.id));
            } catch (error) { status.textContent = error.message; }
        }

    };
})();
