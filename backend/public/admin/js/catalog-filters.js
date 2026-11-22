/* Admin-only organization; never grants or changes student access. */
(function () {
    const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const classes = [['1ere','1ère'],['2eme','2ème'],['3eme','3ème'],['bac','Bac'],['other','Autre']];
    const branches = [['informatique','Informatique'],['sciences','Sciences'],['mathematiques','Mathématiques'],['technique','Technique'],['economie','Économie'],['lettres','Lettres'],['other','Autre']];
    const targets = (offer, field) => Array.isArray(offer[field]) ? offer[field].map(normalize) : [];
    const matches = (offer, year, branch) => (!year || !targets(offer,'target_classes').length || targets(offer,'target_classes').includes(year)) && (!branch || !targets(offer,'target_branches').length || targets(offer,'target_branches').includes(branch));
    function create({ root, kind, offers, onChange, extra = [] }) {
        const key = 'synta:admin:catalog:' + kind;
        let saved = {};
        try { saved = JSON.parse(sessionStorage.getItem(key) || '{}') || {}; } catch {}
        root.className = 'catalog-filters';
        const controls = {};
        function field(name, title, options) {
            const label = document.createElement('label'); label.textContent = title;
            const input = document.createElement(options ? 'select' : 'input');
            input.id = 'catalog-' + name;
            if (options) for (const [value,text] of options) input.add(new Option(text,value));
            else { input.type = 'search'; input.placeholder = 'Rechercher une offre…'; }
            label.append(input); root.append(label); controls[name] = input; return input;
        }
        field('year','Classe',[['','Toutes les classes'],...classes]);
        field('branch','Branche',[['','Toutes les branches'],...branches]);
        if (kind === 'courses') field('offer','Offre',[['','Toutes les offres'],['__unlinked','Sans offre associée'],...offers().map(o=>[String(o.id),o.title + ' · ' + audienceBadges(o).join(' · ') + (o.is_active ? '' : ' · Inactive')])]);
        else { field('selectedOffer','Offre',[['','Toutes les offres'],...offers().map(o=>[String(o.id),o.title + ' · ' + audienceBadges(o).join(' · ')])]); field('status','Statut',[['','Tous les statuts'],['active','Actives'],['inactive','Inactives']]); }
        for (const id of extra) {
            const input = document.getElementById(id);
            if (!input) continue;
            const previous = input.parentElement;
            const label = document.createElement('label');
            label.textContent = { searchInput: 'Recherche', categoryFilter: 'Catégorie', statusFilter: 'Statut' }[id] || id;
            input.removeAttribute('oninput'); input.removeAttribute('onchange');
            label.append(input); root.append(label); controls[id] = input;
            if (previous?.classList.contains('filter-bar') && !previous.children.length) previous.remove();
        }
        for (const [name,input] of Object.entries(controls)) {
            if (typeof saved[name] === 'string') input.value = saved[name];
            input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
                if (name === 'year' || name === 'branch') refreshOfferOptions();
                persist(); onChange();
            });
        }
        function refreshOfferOptions() {
            if (!controls.offer) return;
            const selected = controls.offer.value;
            const options = [['','Toutes les offres'],['__unlinked','Sans offre associée'],...offers().filter(o=>matches(o,controls.year.value,controls.branch.value)).map(o=>[String(o.id),o.title + ' · ' + audienceBadges(o).join(' · ') + (o.is_active ? '' : ' · Inactive')])];
            controls.offer.replaceChildren(...options.map(([value,text])=>new Option(text,value)));
            controls.offer.value = options.some(([value])=>value === selected) ? selected : '';
        }
        refreshOfferOptions();
        const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'btn catalog-reset'; reset.textContent = 'Réinitialiser';
        reset.addEventListener('click',()=>{ Object.values(controls).forEach(input=>input.value=''); persist(); onChange(); });root.append(reset);
        const count = document.createElement('p'); count.className = 'catalog-result-count'; count.setAttribute('role','status'); root.after(count);
        function persist() { try { sessionStorage.setItem(key,JSON.stringify(Object.fromEntries(Object.entries(controls).map(([name,input])=>[name,input.value])))); } catch {} }
        return {
            filter(items) {
                const year = controls.year.value, branch = controls.branch.value;
                const offerId = controls.offer?.value, query = normalize(controls.query?.value);
                return items.filter(item=>{
                    if (kind === 'offers') return (!controls.selectedOffer.value || String(item.id) === controls.selectedOffer.value) && matches(item,year,branch) && (!query || normalize(item.title + ' ' + (item.description || '')).includes(query)) && (!controls.status.value || Boolean(item.is_active) === (controls.status.value === 'active'));
                    const ids = Array.isArray(item.offers_ids) ? item.offers_ids.map(String) : [];
                    if (offerId === '__unlinked' && ids.length) return false;
                    if (offerId && offerId !== '__unlinked' && !ids.includes(offerId)) return false;
                    if (!year && !branch) return true;
                    return !ids.length || offers().some(offer=>ids.includes(String(offer.id)) && (!offerId || offerId === '__unlinked' || String(offer.id) === offerId) && matches(offer,year,branch));
                });
            },
            summary(visible,total) { count.textContent = visible + (kind === 'courses' ? ' cours affichés sur ' : ' offres affichées sur ') + total; },
        };
    }
    function courseLabel(course,offers) {
        const ids = Array.isArray(course.offers_ids) ? course.offers_ids.map(String) : [];
        if (!ids.length) return 'Tous les niveaux · Sans offre associée';
        const linked = offers.filter(o=>ids.includes(String(o.id)));
        if (!linked.length) return 'Offre associée';
        return linked.map(o=>{
            const years = targets(o,'target_classes').map(v=>classes.find(([id])=>id===v)?.[1] || v);
            const sections = targets(o,'target_branches').map(v=>branches.find(([id])=>id===v)?.[1] || v);
            return (years.join(', ') || 'Toutes les classes') + ' · ' + (sections.join(', ') || 'Toutes les branches');
        }).filter((v,i,a)=>a.indexOf(v)===i).join(' / ');
    }
    function audienceBadges(offer) {
        const years = targets(offer,'target_classes').map(v=>classes.find(([id])=>id===v)?.[1] || v);
        const sections = targets(offer,'target_branches').map(v=>branches.find(([id])=>id===v)?.[1] || v);
        return [years.join(', ') || 'Toutes les classes', sections.join(', ') || 'Toutes les branches'];
    }
    window.AdminCatalogFilters = { create, courseLabel, audienceBadges };
})();
