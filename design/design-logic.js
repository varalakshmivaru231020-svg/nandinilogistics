
class Component extends DCLogic {
  state = {
    loading: (this.props.showLoader ?? true),
    role: (this.props.defaultRole ?? 'Owner / Admin'),
    screen: 'dashboard', roleMenu: false, toast: null,
    masterTab: 'stores', taskFilter: 'All',
    clTab: 'lib', clCatSel: null, clSel: null, clCatForm: null, clForm: null, cpNew: '', cpEdit: null,
    clCatList: null, clListData: null, newProj: false, itemList: null, indentList: null,
    taskSel: [], projList: null, npDraft: null, npType: 'Apartment', npWbsRows: null, wbsForm: null, docForm: null, docList: null, taskList: null, taskForm: null,
    poBuild: null, poDraft: null, poPick: '', poPrint: null, poView: null,
    inBuild: null, inDraft: null, inPick: '', inView: null,
    grBuild: null, grDraft: null, grPick: '', grView: null,
    itBuild: null, itDraft: null, itView: null, vnBuild: null, vnDraft: null, vnView: null,
    confirmDel: null, newVCat: '', issueLog: null, itHTab: 'all', mRecord: null, taskBulkAssign: false,
    deleted: [], seq: {}, pcForm: null, pcMode: 'new', pcFields: {}, pcView: null, itemSeq: 1,
    poList: null, grnList: null, vendorList: null,
    schedList: null, schProj: null, schTab: 'plan', schAdd: null, extReq: null, apForm: null, schRpt: 'plan',
    isBuild: null, isDraft: null,
    vCats: ['Cement','Aggregates','TMT & structural steel','Sand','Plywood & shuttering','Paints & finishes','Modular fittings · joinery','Electrical','Plumbing & sanitary','Tiles & stone','Hardware & fasteners','Labour contractor'],
    prQ: '', prFrom: '', prTo: '', prA: 'All', prB: 'All', poList: null, grnList: null, vendorList: null,
    selProj: null, projTab: 'overview', boardProj: 0, flStatus: 'All', flCfg: 'All', tower: 'A', selUnit: null,
    flatSetup: false, fsProject: 0, fsTower: '', fsFloors: 8, fsPer: 4, fsFloorCounts: {}, fsBrush: '2 BHK', fsTpl: {}, fsOver: {}, fsNums: {}, fsEdit: null, resFlow: null, resCust: null, custNew: false, resv: {},
    approved: [],
    leadOpen: false, leadName: '', leadMobile: '', leadSource: '', leadCC: '+91',
    selLead: null, leadTab: 'timeline', ldTower: 'A', newNote: '', newFU: '',
    fuType: 'Call', fuDate: '', fuTime: '', fuRemarks: '', leadView: 'grid',
    lfSearch: '', lfStage: 'All', lfSource: 'All', lfFU: 'All', importOpen: false,
    fuView: 'grid', fuSearch: '', fuFType: 'All types', fuMonth: 8,
    leadPage: 1, leadPer: 10, fuPage: 1, fuPer: 12,
    pcForm: null, pcMode: 'new', pcView: null, pcFields: {}, itemSeq: 7, newUnit: '',
    seq: { indent: 483, po: 2204, grn: 119, vendor: 6 }, pcDeleted: [],
    uomList: ['Bags','Ton','kg','cft','cum','sq ft','Litre','Sheets','Nos','Metre','Roll','Box'],
    hrTab: 'staff', empForm: null, empId: null, empView: null, evFrom: '2026-08-24', evTo: '2026-09-06',
    eType: 'Company Staff', eName: '', eCC: '+91', eMobile: '', eAadhaar: '', ePan: '', eAddr: '', eAlt: '', ePhoto: false, eDesig: '', eDocs: [],
    empTypes: ['Company Staff','Contract Role','Direct Labour'], newEType: '',
    designations: ['Project Manager','Site Engineer','Site Supervisor','Store Manager','Sales Executive','Mason','Bar bender','Carpenter','Electrician','Plumber','Painter','Helper'], newDesig: '',
    attDate: '2026-09-06', attProj: 'NN Skyline', att: {},
    rpFrom: '2026-09-01', rpTo: '2026-09-06',
    employees: [
      { id:1, name:'Ramesh Yadav', type:'Direct Labour', mobile:'+91 98450 66120', aadhaar:'4821 7734 9012', pan:'—', addr:'Kadugodi, Bengaluru', alt:'+91 90080 11002', skill:'Mason', desig:'Mason', docs:[{kind:'Aadhaar card',n:'Aadhaar_card.pdf',s:'740 KB'}] },
      { id:2, name:'Suresh Kumar', type:'Direct Labour', mobile:'+91 99860 22417', aadhaar:'6712 4409 3355', pan:'—', addr:'Whitefield, Bengaluru', alt:'—', skill:'Bar bender', desig:'Bar bender' },
      { id:3, name:'Anil Deshpande', type:'Company Staff', mobile:'+91 98862 40917', aadhaar:'2298 6612 7741', pan:'ADQPD1129K', addr:'Indiranagar, Bengaluru', alt:'+91 80500 34112', skill:'Project Manager', desig:'Project Manager', docs:[{kind:'Aadhaar card',n:'Aadhaar_card.pdf',s:'690 KB'},{kind:'PAN card',n:'PAN_card.pdf',s:'220 KB'}] },
      { id:4, name:'Lakshmi Devi', type:'Direct Labour', mobile:'+91 97410 55238', aadhaar:'9012 3387 6654', pan:'—', addr:'Hoskote, Bengaluru', alt:'—', skill:'Helper', desig:'Helper' },
      { id:5, name:'Iqbal Sheikh', type:'Contract Role', mobile:'+91 88670 90144', aadhaar:'3345 9987 1120', pan:'BQSPS8841L', addr:'Mysuru Ring Road', alt:'+91 96320 71188', skill:'Site Supervisor', desig:'Site Supervisor' },
      { id:6, name:'Vijay Naik', type:'Contract Role', mobile:'+91 91080 33472', aadhaar:'7754 2201 8890', pan:'CPWPN2213M', addr:'Nagarbhavi, Bengaluru', alt:'—', skill:'Electrician', desig:'Electrician' },
      { id:7, name:'Dinesh Shetty', type:'Company Staff', mobile:'+91 99450 78221', aadhaar:'1123 5567 4432', pan:'DKLPS5567J', addr:'Yelahanka, Bengaluru', alt:'—', skill:'Store Manager', desig:'Store Manager' }
    ],
    kbSearch: '', kbForm: null, kbName: '', kbDesc: '', kbFiles: [], kbView: null,
    kbArticles: [
      { id:1, name:'Sales pitch — NN Skyline', desc:'Approved talking points, USPs and comparison notes for Skyline. Covers amenities, connectivity to Whitefield tech parks, and the standard objection handling script for pricing questions.', files:[{n:'Skyline_pitch_deck.pdf',s:'4.2 MB'},{n:'Skyline_brochure.pdf',s:'8.1 MB'},{n:'Amenity_photos.zip',s:'22 MB'}], by:'Owner / Admin', at:'02/09/2026, 11:20' },
      { id:2, name:'Site safety induction', desc:'Mandatory induction for every worker and visitor entering an NN Infra site — PPE rules, exclusion zones, emergency assembly points and incident reporting chain.', files:[{n:'Safety_induction.pdf',s:'2.6 MB'},{n:'Toolbox_talk_checklist.xlsx',s:'180 KB'}], by:'Project Manager', at:'28/08/2026, 09:05' },
      { id:3, name:'Indent & PO process guide', desc:'Step-by-step guide for supervisors raising indents: stock check first, activity linkage, value limits, and what happens at each approval level before a PO is issued.', files:[{n:'Procurement_SOP_v3.pdf',s:'1.9 MB'}], by:'Owner / Admin', at:'21/08/2026, 16:40' },
      { id:4, name:'Booking & KYC checklist', desc:'Documents to collect at booking — ID proof, PAN, address proof, loan sanction letter if applicable — plus the token receipt and agreement timeline.', files:[{n:'KYC_checklist.pdf',s:'640 KB'},{n:'Booking_form_template.docx',s:'320 KB'}], by:'Sales', at:'15/08/2026, 14:12' }
    ],
    lostFlow: null, lostReason: '', lostRemarks: '', dragId: null,
    nfLabel: '', nfType: 'text', nfReq: false, nfOptions: '', newStage: '', newReason: '', leadCfgTab: 'fields',
    leadStages: [
      { id:'new', name:'New', fixed:true }, { id:'contacted', name:'Contacted', fixed:false },
      { id:'visit', name:'Site Visit', fixed:false }, { id:'nego', name:'Negotiation', fixed:false },
      { id:'booked', name:'Booked', fixed:true }, { id:'lost', name:'Lost', fixed:true }
    ],
    leadFields: [
      { label:'Name', type:'text', req:true, fixed:true },
      { label:'Mobile number', type:'phone', req:true, fixed:true },
      { label:'Source', type:'dropdown', req:true, fixed:true, options:'Website, MagicBricks, 99acres, Walk-in, Referral' },
      { label:'Email', type:'text', req:false },
      { label:'Budget', type:'number', req:false },
      { label:'Interested in', type:'dropdown', req:false, options:'1 BHK, 2 BHK, 3 BHK, Villa' },
      { label:'Preferred project', type:'dropdown', req:false, options:'NN Skyline, NN Riverview, NN Meadows' },
      { label:'Requirement notes', type:'description', req:false },
      { label:'Site visit planned?', type:'checkbox', req:false }
    ],
    lostReasons: ['Budget mismatch','Bought elsewhere','Location not suitable','Loan rejected','Not responding'],
    leads: [
      { id:1, name:'Rahul Menon', mobile:'+91 98450 11234', src:'Website', want:'Skyline · 2 BHK', budget:'₹78 L', stage:'new' },
      { id:2, name:'Farida Khan', mobile:'+91 99860 44521', src:'MagicBricks', want:'Riverview · 3 BHK', budget:'₹92 L', stage:'new' },
      { id:3, name:'Joseph V.', mobile:'+91 97410 88342', src:'Walk-in', want:'Meadows · villa', budget:'₹1.5 Cr', stage:'new' },
      { id:4, name:'Ananya S.', mobile:'+91 90080 23417', src:'Referral', want:'Meadows · villa', budget:'₹1.6 Cr', stage:'contacted', followups:[{type:'Call',date:'2026-09-08',time:'11:00',remarks:'Discuss villa cluster C options',at:'04/09/2026, 10:12'}] },
      { id:5, name:'Vikram T.', mobile:'+91 88670 55190', src:'99acres', want:'Skyline · 3 BHK', budget:'₹1.1 Cr', stage:'contacted', followups:[{type:'Call',date:'2026-09-01',time:'16:30',remarks:'Not reachable twice',at:'28/08/2026, 09:40'}] },
      { id:6, name:'Deepa & Arjun', mobile:'+91 96320 77804', src:'Website', want:'Skyline · 2 BHK', budget:'₹80 L', stage:'visit', followups:[{type:'Site Visit Scheduled',date:'2026-09-12',time:'10:30',remarks:'Show B-704 and B-1102 sample flat',at:'05/09/2026, 15:05'}] },
      { id:7, name:'Mohammed R.', mobile:'+91 94480 33265', src:'MagicBricks', want:'Riverview · 2 BHK', budget:'₹68 L', stage:'visit' },
      { id:8, name:'Srinivas K.', mobile:'+91 98862 40917', src:'Website', want:'Skyline · B-704', budget:'₹94 L', stage:'nego', followups:[{type:'Call',date:'2026-09-06',time:'17:00',remarks:'Confirm 2% discount decision',at:'05/09/2026, 12:20'}] },
      { id:9, name:'Priya N.', mobile:'+91 91080 66452', src:'Referral', want:'Riverview · A-1203', budget:'₹88 L', stage:'nego' },
      { id:10, name:'Kiran & Shwetha', mobile:'+91 99450 12876', src:'Website', want:'Skyline · B-1102', budget:'₹94.2 L', stage:'booked' },
      { id:11, name:'Naveen G.', mobile:'+91 97390 55023', src:'Walk-in', want:'Meadows · C-08', budget:'₹1.48 Cr', stage:'booked' },
      { id:12, name:'Sanjay B.', mobile:'+91 80950 71134', src:'99acres', want:'Skyline · 2 BHK', budget:'₹75 L', stage:'lost', lostReason:'Budget mismatch' }
    ]
  };
  componentDidMount() {
    if (this.state.loading) this._t = setTimeout(() => this.setState({ loading: false }), 2000);
    const s = this.state;
    if (s.itView || s.poView || s.grView || s.inView || s.vnView || s.pcView) {
      this.setState({ itView:null, poView:null, grView:null, inView:null, vnView:null, pcView:null });
    }
  }
  componentWillUnmount() { clearTimeout(this._t); clearTimeout(this._tt); }
  toast(msg) {
    this.setState({ toast: msg });
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.setState({ toast: null }), 2600);
  }
  ic(paths) {
    const kids = paths.map((d, i) => React.createElement('path', { key: i, d }));
    return React.createElement('svg', { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }, kids);
  }
  pill(fg, bg) { return { font: "700 10.5px 'Public Sans',sans-serif", color: fg, background: bg, borderRadius: '99px', padding: '5px 10px', whiteSpace: 'nowrap', display: 'inline-block' }; }
  renderVals() {
    const S = this.state, setS = (o) => this.setState(o);
    const ROLES = [
      { name: 'Owner / Admin', sub: 'Everything', dot: '#191A5C' },
      { name: 'Project Manager', sub: 'Execution', dot: '#0089C9' },
      { name: 'Supervisor', sub: 'Site · mobile', dot: '#5BC8F2' },
      { name: 'Store Manager', sub: 'Material', dot: '#E8A13A' },
      { name: 'Sales', sub: 'Lead → booking', dot: '#1F9D66' }
    ];
    const ACCESS = {
      'Owner / Admin': ['dashboard','projects','tasks','checklists','schedule','indents','pos','grn','items','vendors','leads','followups','flats','hr','kb','masters'],
      'Project Manager': ['dashboard','projects','tasks','checklists','schedule','indents','pos','grn','items','vendors','hr','kb'],
      'Supervisor': ['dashboard','tasks','checklists','indents','items','hr','kb'],
      'Store Manager': ['dashboard','indents','pos','grn','items','vendors','kb','masters'],
      'Sales': ['dashboard','leads','followups','flats','kb']
    };
    const allowed = ACCESS[S.role] || ACCESS['Owner / Admin'];
    const IC = {
      dashboard: this.ic(['M3 3h7v9H3z','M14 3h7v5h-7z','M14 12h7v9h-7z','M3 16h7v5H3z']),
      projects: this.ic(['M3 21h18','M5 21V7l7-4v18','M19 21V11l-7-3','M9 9h.01M9 13h.01M9 17h.01']),
      tasks: this.ic(['M9 11l3 3L22 4','M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11']),
      checklists: this.ic(['M9 6h11M9 12h11M9 18h11','M4 6h.01M4 12h.01M4 18h.01']),
      schedule: this.ic(['M3 5h13','M3 10h18','M8 15h13','M3 20h10']),
      procurement: this.ic(['M21 8l-9-5-9 5v8l9 5 9-5V8','M3 8l9 5 9-5','M12 13v8']),
      leads: this.ic(['M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2','M9.5 3a4 4 0 100 8 4 4 0 000-8','M22 21v-2a4 4 0 00-3-3.87','M15.5 3.13a4 4 0 010 7.75']),
      flats: this.ic(['M3 3h18v18H3z','M3 9h18','M3 15h18','M9 3v18','M15 3v18']),
      masters: this.ic(['M4 21v-7M4 10V3','M12 21v-9M12 8V3','M20 21v-5M20 12V3','M1 14h6M9 8h6M17 16h6']),
      followups: this.ic(['M12 22a10 10 0 100-20 10 10 0 000 20','M12 7v5l3.5 2']),
      indents: this.ic(['M9 2h6v4H9z','M4 6h16v16H4z','M8 12h8M8 16h5']),
      pos: this.ic(['M6 2h9l5 5v15H6z','M14 2v6h6','M9 13h6M9 17h4']),
      grn: this.ic(['M3 7l9-4 9 4v10l-9 4-9-4z','M3 7l9 4 9-4','M12 11v10','M9 15l2 2 4-4']),
      items: this.ic(['M3 4h18v6H3z','M3 14h18v6H3z','M7 7h.01M7 17h.01']),
      vendors: this.ic(['M3 21h18','M5 21V8l7-5 7 5v13','M9 21v-6h6v6']),
      kb: this.ic(['M4 19.5A2.5 2.5 0 016.5 17H20','M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z']),
      hr: this.ic(['M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2','M9.5 3a4 4 0 100 8 4 4 0 000-8','M22 11h-6','M19 8v6'])
    };
    const TITLES = { indents:'Requirement Indents', pos:'Purchase Orders', grn:'Goods Receipt · GRN', items:'Item Master · Stock', vendors:'Vendors', hr:'Users & Attendance', kb:'Knowledge Base', followups:'Follow-ups', dashboard:'Dashboard', projects:'Project Management', tasks:'Task Management', checklists:'Checklist Management', schedule:'Project Schedule', procurement:'Material & Inventory', leads:'Lead Management · Sales CRM', flats:'Available Flats · Unit Inventory', masters:'Masters & Users' };
    const groupsDef = [
      { label:'Overview', ids:['dashboard'] },
      { label:'Execution', ids:['projects','tasks','checklists','schedule'] },
      { label:'Procurement', ids:['indents','pos','grn','items','vendors'] },
      { label:'Sales', ids:['leads','followups','flats'] },
      { label:'Workforce', ids:['hr'] },
      { label:'Administration', ids:['kb','masters'] }
    ];
    const tCount = S.taskList ? S.taskList.length : 8;
    const badges = { tasks: tCount ? String(tCount) : '', indents:'14' };
    const nav = groupsDef.map(g => ({ label: g.label, items: g.ids.filter(id => allowed.includes(id)).map(id => {
      const active = S.screen === id;
      return {
        label: TITLES[id].split(' ·')[0].replace('Management','').trim() === '' ? TITLES[id] : ({dashboard:'Dashboard',projects:'Projects',tasks:'Tasks',checklists:'Checklists',schedule:'Schedule',indents:'Indents',pos:'Purchase Orders',grn:'Goods Receipt',items:'Item Master',vendors:'Vendors',leads:'Leads · CRM',followups:'Follow-ups',flats:'Available Flats',hr:'Users & Attendance',kb:'Knowledge Base',masters:'Masters & Users'})[id],
        icon: IC[id], go: () => setS({ screen: id, selProj: null, prQ:'', prFrom:'', prTo:'', prA:'All', prB:'All', poBuild:null, poDraft:null, poView:null, poPrint:null, inBuild:null, inDraft:null, inView:null, isBuild:null, isDraft:null, grBuild:null, grDraft:null, grView:null, itBuild:null, itDraft:null, itView:null, vnBuild:null, vnDraft:null, vnView:null }),
        badge: badges[id] || false,
        badgeStyle: { font:"700 9.5px 'Public Sans',sans-serif", color: active ? '#fff' : '#B4530A', background: active ? 'rgba(255,255,255,.22)' : '#FDF3E7', borderRadius:'99px', padding:'2px 7px' },
        style: {
          display:'flex', alignItems:'center', gap:'11px', width:'100%', border:'none', cursor:'pointer',
          borderRadius:'9px', padding:'9.5px 10px',
          font:`${active?'700':'600'} 12.5px 'Public Sans',sans-serif`,
          background: active ? 'linear-gradient(140deg,#0089C9,#2F308C)' : 'transparent',
          color: active ? '#FFFFFF' : '#5A6080',
          boxShadow: active ? '0 6px 16px rgba(0,137,201,.28)' : 'none'
        }
      };
    })})).filter(g => g.items.length);
    const roles = ROLES.map(r => ({
      name: r.name, sub: r.sub, pick: () => {
        const acc = ACCESS[r.name];
        setS({ role: r.name, roleMenu: false, screen: acc.includes(S.screen) ? S.screen : 'dashboard', selProj: null });
        this.toast('Signed in as ' + r.name);
      },
      dotStyle: { width:'9px', height:'9px', borderRadius:'99px', background: r.dot, flexShrink:0 },
      style: { display:'flex', alignItems:'center', gap:'10px', width:'100%', border:'none', cursor:'pointer', background: S.role===r.name?'#EFF3FB':'transparent', borderRadius:'9px', padding:'9px 10px', font:`${S.role===r.name?'700':'600'} 12.5px 'Public Sans',sans-serif`, color:'#22264A' }
    }));
    // DASHBOARD
    const kIcon = (d,c,b)=>({ icon:this.ic(d), iconWrap:{width:'30px',height:'30px',borderRadius:'9px',background:b,color:c,display:'flex',alignItems:'center',justifyContent:'center'} });
    const kpis = [
      { label:'Active projects', value:'3', delta:'▲ 1', sub:'6 towers · 1,272 units', ...kIcon(['M3 21h18','M5 21V7l7-4v18','M19 21V11l-7-3'],'#0089C9','#E3F2FC'), deltaStyle:this.pill('#177049','#E4F6EC') },
      { label:'Budget vs actual', value:'₹128.4 Cr', delta:'90.1%', sub:'of ₹142.6 Cr sanctioned', ...kIcon(['M12 1v22','M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],'#2F308C','#EFE9FC'), deltaStyle:this.pill('#2F308C','#EFF3FB') },
      { label:'Pending approvals', value:'14', delta:'₹1.82 Cr', sub:'oldest waiting 4 days', ...kIcon(['M12 8v4l3 3','M12 22a10 10 0 100-20 10 10 0 000 20'],'#B4530A','#FDF3E7'), deltaStyle:this.pill('#B4530A','#FDF3E7') },
      { label:'Collections · Sep', value:'₹6.4 Cr', delta:'▲ 18%', sub:'11 bookings this month', ...kIcon(['M22 12h-4l-3 9L9 3l-3 9H2'],'#177049','#E4F6EC'), deltaStyle:this.pill('#177049','#E4F6EC') }
    ];
    const QUEUE = [
      { id:'q1', type:'INDENT', tc:'#0672A6', tb:'#E3F2FC', ref:'IND-SKY-0482', title:'OPC 53 Cement · 400 bags', project:'NN Skyline', by:'R. Manjunath', value:'₹1.58 L', age:'2 days', hot:false },
      { id:'q2', type:'PO', tc:'#2F308C', tb:'#EFE9FC', ref:'PO-2203', title:'TMT Steel 12 mm Fe550 · 8 T', project:'NN Skyline', by:'Store · D. Shetty', value:'₹4.67 L', age:'4 days', hot:true },
      { id:'q3', type:'DISCOUNT', tc:'#B4530A', tb:'#FDF3E7', ref:'LD-0761 · B-704', title:'2.0% discount — Srinivas K.', project:'NN Skyline Sales', by:'Meera Nair', value:'₹1.88 L', age:'1 day', hot:false },
      { id:'q4', type:'PAYMENT', tc:'#177049', tb:'#E4F6EC', ref:'PAY-0912 · GRN-118', title:'SteelCorp Traders — matched invoice', project:'NN Riverview', by:'Store · K. Hegde', value:'₹6.21 L', age:'2 days', hot:false }
    ];
    const queue = QUEUE.filter(q => !S.approved.includes(q.id)).map(q => ({
      ...q, typeStyle: { ...this.pill(q.tc, q.tb), letterSpacing:'.05em' },
      ageStyle: { font:"600 11px 'Public Sans',sans-serif", color: q.hot ? '#D8494A' : '#9BA1C2', marginTop:'2px' },
      approve: () => { setS({ approved:[...S.approved, q.id] }); this.toast(q.ref + ' approved — routed to next step'); },
      reject: () => { setS({ approved:[...S.approved, q.id] }); this.toast(q.ref + ' rejected with remarks'); }
    }));
    const bar = (pct, grad) => ({ height:'100%', width: pct+'%', borderRadius:'99px', background: grad || 'linear-gradient(90deg,#0089C9,#5BC8F2)', animation:'growW .8s ease both' });
    const progress = [
      { name:'NN Skyline · Bengaluru', pct:64, meta:'₹58.2 Cr spent · slab 12 of 24 · on track', barStyle:bar(64) },
      { name:'NN Riverview · Mysuru', pct:38, meta:'₹31.6 Cr spent · structure phase · +9 d slip', barStyle:bar(38,'linear-gradient(90deg,#E8A13A,#F2C063)') },
      { name:'NN Meadows Villas · Devanahalli', pct:82, meta:'₹38.6 Cr spent · finishing · handover Q1 27', barStyle:bar(82,'linear-gradient(90deg,#1F9D66,#5BC8A2)') }
    ];
    const stockAlerts = [
      { item:'OPC 53 Cement · bags', store:'Skyline main store', level:'220 / 300' },
      { item:'Shuttering plywood · sheets', store:'Riverview store', level:'90 / 120' }
    ];
    const fMax = 41;
    const funnel = [
      { stage:'New', count:41, c:'#5BC8F2' }, { stage:'Contacted', count:28, c:'#0089C9' },
      { stage:'Visit', count:16, c:'#2F308C' }, { stage:'Nego.', count:7, c:'#191A5C' }, { stage:'Booked', count:3, c:'#1F9D66' }
    ].map(f => ({ ...f, barStyle: { width:'100%', borderRadius:'7px 7px 3px 3px', background:f.c, height: Math.max(8, Math.round(f.count/fMax*80))+'px', animation:'growW .6s ease both' } }));
    const hc = (v,l,fg,bg,bd)=>({ value:v, label:l, style:{ background:bg, border:'1px solid '+bd, borderRadius:'11px', padding:'13px 15px', color:fg } });
    const health = [
      hc('23','Overdue tasks · escalated','#B23334','#FCEDED','#F2CBCB'),
      hc('91.4%','Checklist compliance','#177049','#E4F6EC','#C4E8D4'),
      hc('7','Open snags (NC)','#B4530A','#FDF3E7','#F3DDBB'),
      hc('96%','Photo evidence on closure','#2F308C','#EFF3FB','#DDE4F3')
    ];
    // PROJECTS
    const stChip = (s) => s==='Ongoing' ? this.pill('#0672A6','#E3F2FC') : s==='Planned' ? this.pill('#6A46C8','#EFE9FC') : s==='On Hold' ? this.pill('#B4530A','#FDF3E7') : this.pill('#177049','#E4F6EC');
    const PSEED = [
      { name:'NN Skyline', code:'PRJ-001', location:'Whitefield, Bengaluru', type:'Apartment', rera:'PRM/KA/RERA/1251/446/24', scale:'3 towers · 24 fl · 648 units', pm:'Anil Deshpande', pct:64, spend:'₹58.2 Cr', budget:'₹96.4 Cr', status:'Ongoing',
        wbs:[{tag:'PHASE',name:'Tower B — Structure',pct:71},{tag:'WP',name:'Slab casting · Floors 7–12',pct:55},{tag:'WP',name:'Rebar & shuttering · Fl 7–8',pct:40},{tag:'PHASE',name:'Tower B — MEP',pct:12},{tag:'WP',name:'Electrical first fix · Fl 1–4',pct:18}],
        team:[{name:'A. Deshpande',role:'PM'},{name:'V. Sharma',role:'Engineer'},{name:'R. Manjunath',role:'Supervisor'},{name:'S. Kumar',role:'Supervisor'},{name:'D. Shetty',role:'Store'},{name:'M. Nair',role:'Sales'}], docs:'148', photos:'6' },
      { name:'NN Riverview', code:'PRJ-002', location:'Ring Road, Mysuru', type:'Apartment', rera:'PRM/KA/RERA/1263/512/25', scale:'2 towers · 18 fl · 456 units', pm:'Kavitha Rao', pct:38, spend:'₹31.6 Cr', budget:'₹82.0 Cr', status:'Ongoing',
        wbs:[{tag:'PHASE',name:'Tower A — Structure',pct:44},{tag:'WP',name:'Block work · Floors 1–4',pct:20},{tag:'WP',name:'Slab cycle · Fl 5–8',pct:8}],
        team:[{name:'K. Rao',role:'PM'},{name:'T. Prakash',role:'Engineer'},{name:'M. Iqbal',role:'Supervisor'},{name:'V. Naik',role:'Supervisor'},{name:'K. Hegde',role:'Store'}], docs:'96', photos:'4' },
      { name:'NN Meadows Villas', code:'PRJ-003', location:'Devanahalli, Bengaluru', type:'Villa', rera:'PRM/KA/RERA/1251/389/23', scale:'84 villas · 3 clusters', pm:'Suresh Patil', pct:82, spend:'₹38.6 Cr', budget:'₹46.2 Cr', status:'Ongoing',
        wbs:[{tag:'PHASE',name:'Cluster C — Finishing',pct:78},{tag:'WP',name:'Painting & fixtures · C1–C14',pct:64},{tag:'WP',name:'Plastering · C15–C28',pct:70}],
        team:[{name:'S. Patil',role:'PM'},{name:'P. Gowda',role:'Supervisor'},{name:'N. Gupta',role:'Sales'}], docs:'112', photos:'3' },
      { name:'NN Trade Park', code:'PRJ-004', location:'Hebbal, Bengaluru', type:'Commercial', rera:'Applied — pending', scale:'1 tower · 12 fl · 84 units', pm:'Kavitha Rao', pct:0, spend:'₹0.8 Cr', budget:'₹64.0 Cr', status:'Planned',
        wbs:[{tag:'PHASE',name:'Pre-construction',pct:12},{tag:'WP',name:'Soil testing & excavation plan',pct:30},{tag:'WP',name:'Sanction drawings',pct:8}],
        team:[{name:'K. Rao',role:'PM'}], docs:'22', photos:'0' }
    ];
    const avColors = ['#0089C9','#2F308C','#1F9D66','#E8A13A'];
    const PDATA = S.projList || PSEED;
    const projWrite = (l) => setS({ projList: l });
    const scaleNum = (s, re) => { const m = String(s||'').match(re); return m ? parseInt(m[1]) : 0; };
    const portfolio = (() => {
      const tw = PDATA.reduce((a,p) => a + scaleNum(p.scale, /(\d+)\s*(?:towers?|blocks?)/i), 0);
      const un = PDATA.reduce((a,p) => a + scaleNum(p.scale, /(\d+)\s*(?:units?|villas?|plots?|flats?|shops?)/i), 0);
      const active = PDATA.filter(p => p.status !== 'Completed').length;
      return { n: PDATA.length, towers: tw, units: un,
        unitsTxt: un.toLocaleString('en-IN'), active: String(active),
        sub: tw + ' towers · ' + un.toLocaleString('en-IN') + ' units' }; })();
    if (kpis[0]) { kpis[0].value = portfolio.active; kpis[0].sub = portfolio.sub; }
    const projects = PDATA.map((p, i) => ({
      ...p, pmInit: p.pm.split(' ').map(x=>x[0]).join(''),
      pmAvatar: { width:'26px', height:'26px', borderRadius:'99px', background:avColors[i%4], color:'#fff', font:"700 10px 'Public Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
      barStyle: bar(p.pct), statusStyle: stChip(p.status),
      open: () => setS({ selProj: i })
    }));
    const PEXTRA = [
      { land:'4.20 acres', fl:'24 floors', start:'12 Jan 2025', end:'30 Jun 2028', appr:'BBMP plan sanction · BBMP/ADTP/0455/24-25' },
      { land:'3.10 acres', fl:'18 floors', start:'01 Apr 2025', end:'31 Dec 2028', appr:'MUDA plan sanction · MUDA/PS/1182/25' },
      { land:'11.60 acres', fl:'G+1 villas', start:'15 Aug 2023', end:'31 Mar 2027', appr:'BIAAPA sanction · BIAAPA/SP/0341/23' },
      { land:'1.80 acres', fl:'12 floors', start:'01 Dec 2026', end:'—', appr:'Plan sanction applied · pending' }
    ];
    const spRaw = S.selProj != null ? PDATA[S.selProj] : PDATA[0];
    const ND = S.npDraft || {};
    const spEx = (spRaw && spRaw.ex) || (S.selProj != null ? PEXTRA[S.selProj] : PEXTRA[0]) || {};
    const tagC = { PHASE:['#2F308C','#EFE9FC'], WP:['#0672A6','#E3F2FC'] };
    const sp = { ...spRaw,
      wbs: spRaw.wbs.map((w)=>({ ...w, tagStyle:{...this.pill(tagC[w.tag][0],tagC[w.tag][1]),fontSize:'9px',letterSpacing:'.07em'}, style:{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', marginLeft:(w.tag==='WP'?22:0)+'px', background: w.tag==='PHASE'?'#EFF3FB':'#F7F9FD', border:'1px solid #E9EDF6', borderRadius:'10px', marginBottom:'6px' },
        edit: () => setS({ wbsForm: { mode:'edit', idx: spRaw.wbs.indexOf(w), tag:w.tag, name:w.name, pct:String(w.pct==null?0:w.pct) } }),
        del: () => setS({ confirmDel: { what: w.tag==='PHASE' ? 'phase' : 'work package', name: w.name,
          run: () => { const l = PDATA.map((p,pi) => pi !== (S.selProj||0) ? p : { ...p, wbs: p.wbs.filter((_,i) => i !== spRaw.wbs.indexOf(w)) });
            projWrite(l); this.toast(w.name + ' removed from the breakdown'); } } }) })),
      log: [{time:'08:12'},{time:'11:40'},{time:'15:05'}]
    };
    sp.fields = [
      { k:'Project name', v:spRaw.name }, { k:'Project code', v:spRaw.code }, { k:'Location', v:spRaw.location },
      { k:'Project type', v:spRaw.type }, { k:'RERA registration no.', v:spRaw.rera }, { k:'Land area', v:spEx.land },
      { k:'Towers & floors', v:spRaw.scale.split('·').slice(0,2).join('·').trim() }, { k:'Total units', v:spRaw.scale.split('·').pop().trim() }, { k:'Approval details', v:spEx.appr },
      { k:'Planned start', v:spEx.start }, { k:'Target completion', v:spEx.end }, { k:'Status', v:spRaw.status }
    ];
    const dtag = (t,fg,bg)=>({...this.pill(fg,bg),fontSize:'9px',letterSpacing:'.06em'});
    sp.logAdd = () => this.toast('New progress entry — attach geo-tagged photos from mobile');
    const DOCSEED = [
      { name:'GFC structural drawings — Tower B', meta:'v6 · uploaded 28 Aug 2026 · A. Deshpande', tag:'DRAWING', tagStyle:dtag('DRAWING','#0672A6','#E3F2FC'), acc:'PM · Supervisor' },
      { name:'RERA registration certificate', meta:'v1 · 14 Mar 2024 · Admin', tag:'LICENCE', tagStyle:dtag('LICENCE','#177049','#E4F6EC'), acc:'All roles · view' },
      { name:'Plan sanction order', meta:'v2 · 02 Feb 2025 · Admin', tag:'APPROVAL', tagStyle:dtag('APPROVAL','#6A46C8','#EFE9FC'), acc:'Owner · PM' },
      { name:'JDA agreement — landowner', meta:'v3 · 20 Nov 2024 · Owner', tag:'AGREEMENT', tagStyle:dtag('AGREEMENT','#B4530A','#FDF3E7'), acc:'Owner only' },
      { name:'Soil investigation report', meta:'v1 · 08 Oct 2024 · K. Rao', tag:'REPORT', tagStyle:dtag('REPORT','#4A5077','#EEF1F9'), acc:'PM · Engineers' }
    ];
    const DTAGC = { DRAWING:['#0672A6','#E3F2FC'], LICENCE:['#177049','#E4F6EC'], APPROVAL:['#6A46C8','#EFE9FC'],
      AGREEMENT:['#B4530A','#FDF3E7'], REPORT:['#4A5077','#EEF1F9'], CONTRACT:['#B23334','#FCEDED'], OTHER:['#4A5077','#EEF1F9'] };
    const docsAll = S.docList || DOCSEED.map((d, i) => ({ ...d, id: 'DOC-' + (100 + i), proj: 'NN Skyline' }));
    const docWrite = (l) => setS({ docList: l });
    sp.docsList = docsAll.filter(d => !d.proj || d.proj === spRaw.name).map((d, di) => ({ ...d,
      tagStyle: dtag(d.tag, (DTAGC[d.tag]||DTAGC.OTHER)[0], (DTAGC[d.tag]||DTAGC.OTHER)[1]),
      edit: () => setS({ docForm: { mode:'edit', ref:d, name:d.name, tag:d.tag, acc:d.acc, ver:'' } }),
      newVer: () => setS({ docForm: { mode:'ver', ref:d, name:d.name, tag:d.tag, acc:d.acc, ver:'' } }),
      del: () => setS({ confirmDel: { what:'document', name:d.name,
        run: () => { docWrite(docsAll.filter(x => x.id !== d.id)); this.toast(d.name + ' deleted from the repository'); } } }) }));
    sp.docs = String(sp.docsList.length);
    const roleDot = { 'Project Manager':'#0089C9','Engineer':'#6A46C8','Supervisor':'#5BC8F2','Store Manager':'#E8A13A','Sales':'#1F9D66' };
    const teamRoles = ['Project Manager','Engineer','Supervisor','Store Manager','Sales'];
    const roleAlias = { PM:'Project Manager', Supervisor:'Supervisor', Store:'Store Manager', Sales:'Sales', Engineer:'Engineer' };
    sp.teamMap = teamRoles.map(role => ({
      role, dotStyle:{ width:'9px', height:'9px', borderRadius:'99px', background:roleDot[role], flexShrink:0 },
      members: spRaw.team.filter(t => roleAlias[t.role]===role).map(t=>({ name:t.name, unmap: () => this.toast(t.name + ' unmapped from ' + role + ' — access revoked') })),
      empty: spRaw.team.filter(t => roleAlias[t.role]===role).length===0,
      map: () => this.toast('Pick a user to map as ' + role + ' — access follows the mapping')
    }));
    // TASKS
    const TSTAT = { 'Open':['#4A5077','#EEF1F9'], 'In Progress':['#0672A6','#E3F2FC'], 'Submitted':['#6A46C8','#EFE9FC'], 'Approved':['#177049','#E4F6EC'], 'Reopened':['#C05621','#FDEEE7'] };
    const TDATA = [
      { id:'T-1042', title:'Slab shuttering — 7th floor', loc:'Skyline · Tower B · Fl 7', who:'R. Manjunath', due:'04 Sep', pri:'High', status:'In Progress', ev:'2 photos', od:false },
      { id:'T-1038', title:'Rebar inspection — 6th floor slab', loc:'Skyline · Tower B · Fl 6', who:'S. Kumar', due:'02 Sep', pri:'High', status:'Submitted', ev:'5 photos ✓', od:false },
      { id:'T-1029', title:'Block work — Fl 3 East wing', loc:'Riverview · Tower A · Fl 3', who:'M. Iqbal', due:'30 Aug', pri:'Medium', status:'Open', ev:'—', od:true },
      { id:'T-1033', title:'Snag: honeycombing at column C4', loc:'Skyline · Tower B · Fl 5', who:'S. Kumar', due:'03 Sep', pri:'High', status:'Open', ev:'NC photo ✓', od:false },
      { id:'T-1027', title:'Waterproofing — podium deck', loc:'Skyline · Podium', who:'R. Manjunath', due:'01 Sep', pri:'High', status:'Reopened', ev:'3 photos', od:true },
      { id:'T-1046', title:'Plastering — villa cluster C', loc:'Meadows · Cluster C', who:'P. Gowda', due:'06 Sep', pri:'Medium', status:'In Progress', ev:'4 photos', od:false },
      { id:'T-1051', title:'Electrical conduiting — Fl 5', loc:'Riverview · Tower A · Fl 5', who:'V. Naik', due:'09 Sep', pri:'Low', status:'Open', ev:'—', od:false },
      { id:'T-1050', title:'Curing log — slab 6', loc:'Skyline · Tower B · Fl 6', who:'R. Manjunath', due:'05 Sep', pri:'Low', status:'Approved', ev:'daily ✓', od:false }
    ];
    const filters = ['All','Open','In Progress','Submitted','Overdue'];
    const fcount = (f) => f==='All' ? (S.taskList || TDATA).length : f==='Overdue' ? (S.taskList || TDATA).filter(t=>t.od).length : (S.taskList || TDATA).filter(t=>t.status===f).length;
    const taskChips = filters.map(f => ({
      label:f, count:fcount(f), pick:()=>setS({taskFilter:f, taskSel:[]}),
      style:{ border:'1px solid '+(S.taskFilter===f?'#0089C9':'#E3E7F2'), background:S.taskFilter===f?'#E3F2FC':'#fff', color:S.taskFilter===f?'#0672A6':'#5A6080', font:"600 12px 'Public Sans',sans-serif", borderRadius:'99px', padding:'8px 14px', cursor:'pointer', display:'flex', gap:'6px', alignItems:'center' }
    }));
    const TLIVE = S.taskList || TDATA;
    const taskWrite = (l) => setS({ taskList: l });
    const TFLOW = { 'Open':'In Progress', 'In Progress':'Submitted', 'Submitted':'Approved', 'Reopened':'In Progress', 'Approved':'Approved' };
    const tasks = TLIVE.filter(t => S.taskFilter==='All' ? true : S.taskFilter==='Overdue' ? t.od : t.status===S.taskFilter).map(t => ({
      ...t, evidence:t.ev,
      rowStyle: t.od ? { background:'#FEF7F7' } : {},
      dueStyle: { font:"600 12px 'Public Sans',sans-serif", color:t.od?'#D8494A':'#3A3F5C', background:t.od?'#FCEDED':'transparent', borderRadius:'7px', padding:t.od?'4px 9px':'0' },
      priStyle: this.pill(t.pri==='High'?'#B23334':t.pri==='Medium'?'#B4530A':'#4A5077', t.pri==='High'?'#FCEDED':t.pri==='Medium'?'#FDF3E7':'#EEF1F9'),
      stStyle: this.pill(TSTAT[t.status][0], TSTAT[t.status][1]),
      due: t.od ? t.due+' · overdue' : t.due,
      nextLabel: t.status === 'Approved' ? 'Reopen' : '→ ' + TFLOW[t.status],
      advance: () => { const nx = t.status === 'Approved' ? 'Reopened' : TFLOW[t.status];
        taskWrite(TLIVE.map(x => x.id !== t.id ? x : { ...x, status: nx, od: nx === 'Approved' ? false : x.od }));
        this.toast(t.id + ' moved to ' + nx); },
      edit: () => setS({ taskForm: { mode:'edit', ref:t, title:t.title, proj:t.proj || '', loc: t.proj ? String(t.loc).replace(t.proj + ' · ', '') : t.loc, who:t.who, due:t.due, pri:t.pri } }),
      del: () => setS({ confirmDel: { what:'task', name: t.id + ' · ' + t.title,
        run: () => { taskWrite(TLIVE.filter(x => x.id !== t.id)); this.toast(t.id + ' deleted'); } } }),
      picked: (S.taskSel||[]).includes(t.id),
      boxStyle: (() => { const on = (S.taskSel||[]).includes(t.id);
        return { width:'16px', height:'16px', borderRadius:'4px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          border:'1.5px solid ' + (on ? '#0089C9' : '#C6CFE8'), background: on ? '#0089C9' : '#fff',
          font:"800 10px 'Public Sans',sans-serif", color:'#fff', padding:0 }; })(),
      boxMark: (S.taskSel||[]).includes(t.id) ? '✓' : '',
      toggleSel: () => { const cur = S.taskSel || [];
        setS({ taskSel: cur.includes(t.id) ? cur.filter(x => x !== t.id) : [...cur, t.id] }); }
    }));
    // ===== CHECKLISTS · Category → Checklist → Checkpoints =====
    const CLCATS = S.clCatList || [
      { id:'C1', name:'Civil', code:'CIV', note:'RCC, block work, plaster and finishes' },
      { id:'C2', name:'Plumbing', code:'PLB', note:'Water supply, drainage, sanitary fixtures' },
      { id:'C3', name:'Electrical', code:'ELE', note:'Conduiting, wiring, DB and earthing' },
      { id:'C4', name:'Waterproofing', code:'WPF', note:'Terrace, toilets, podium and basement' },
      { id:'C5', name:'Painting', code:'PNT', note:'Putty, primer and finish coats' },
      { id:'C6', name:'Safety', code:'SFT', note:'Site safety, PPE, height work and machinery' },
      { id:'C7', name:'Snagging', code:'SNG', note:'Pre-handover defect capture' },
      { id:'C8', name:'Handover', code:'HND', note:'Unit handover to customer' }
    ];
    const CLISTS = S.clListData || [
      { id:'L1', catId:'C1', name:'Slab casting QC', ver:'v1.3', points:[
        { id:'P1', txt:'Shuttering line, level and props checked against drawing', mand:true },
        { id:'P2', txt:'Reinforcement diameter, spacing and laps as per BBS', mand:true },
        { id:'P3', txt:'Cover blocks placed at required spacing', mand:true },
        { id:'P4', txt:'Electrical conduits and sleeves laid before pour', mand:false },
        { id:'P5', txt:'Construction joint surface cleaned and slurry applied', mand:false },
        { id:'P6', txt:'Slump test taken and recorded for each transit mixer', mand:true },
        { id:'P7', txt:'Cube samples cast and labelled', mand:true },
        { id:'P8', txt:'Vibrator working, standby available', mand:false },
        { id:'P9', txt:'Finished level checked with auto level', mand:true },
        { id:'P10', txt:'Curing arrangement in place within 12 hours', mand:true } ] },
      { id:'L2', catId:'C1', name:'Block work QC', ver:'v1.0', points:[
        { id:'P11', txt:'Blocks soaked and free of cracks', mand:true },
        { id:'P12', txt:'Line, level and plumb verified every 3 courses', mand:true },
        { id:'P13', txt:'Mortar mix ratio as specified', mand:true },
        { id:'P14', txt:'Openings and lintel bearing as per drawing', mand:false } ] },
      { id:'L3', catId:'C2', name:'Plumbing pressure test', ver:'v2.0', points:[
        { id:'P15', txt:'All joints visible and accessible before test', mand:true },
        { id:'P16', txt:'Line pressurised to 1.5 times working pressure', mand:true },
        { id:'P17', txt:'Pressure held for 2 hours without drop', mand:true },
        { id:'P18', txt:'No sweating or leak at any joint', mand:true },
        { id:'P19', txt:'Test reading photographed with gauge visible', mand:false } ] },
      { id:'L4', catId:'C3', name:'Electrical conduiting', ver:'v1.1', points:[
        { id:'P20', txt:'Conduit route matches approved layout', mand:true },
        { id:'P21', txt:'Bends within permissible limits, no crushing', mand:true },
        { id:'P22', txt:'Fish wire inserted in every conduit', mand:true },
        { id:'P23', txt:'Junction boxes flush with finished surface', mand:false } ] },
      { id:'L5', catId:'C4', name:'Toilet waterproofing', ver:'v1.2', points:[
        { id:'P24', txt:'Surface cleaned, chipped and made dust free', mand:true },
        { id:'P25', txt:'Corner fillets and coving formed', mand:true },
        { id:'P26', txt:'Two coats applied in cross direction', mand:true },
        { id:'P27', txt:'Ponding test held 48 hours with no seepage', mand:true },
        { id:'P28', txt:'Photographs of ponding test attached', mand:false } ] },
      { id:'L6', catId:'C6', name:'Site safety walk', ver:'v3.0', points:[
        { id:'P29', txt:'All workers wearing helmet and safety shoes', mand:true },
        { id:'P30', txt:'Full body harness used above 3 m', mand:true },
        { id:'P31', txt:'Edge protection and guard rails intact', mand:true },
        { id:'P32', txt:'Scaffolding tagged and inspected this week', mand:true },
        { id:'P33', txt:'Fire extinguishers charged and accessible', mand:false },
        { id:'P34', txt:'First aid box stocked, trained person on site', mand:false } ] },
      { id:'L7', catId:'C7', name:'Pre-handover snag list', ver:'v1.4', points:[
        { id:'P35', txt:'Doors and windows operate freely, no gaps', mand:true },
        { id:'P36', txt:'Tile joints uniform, no hollow sound', mand:true },
        { id:'P37', txt:'Paint finish free of patches and roller marks', mand:false },
        { id:'P38', txt:'All switches, sockets and lights working', mand:true },
        { id:'P39', txt:'Taps, flush and drains working without leak', mand:true } ] },
      { id:'L8', catId:'C8', name:'Unit handover checklist', ver:'v1.0', points:[
        { id:'P40', txt:'Snag list closed and signed by customer', mand:true },
        { id:'P41', txt:'Meter readings recorded and shared', mand:true },
        { id:'P42', txt:'Keys, access cards and warranty documents handed over', mand:true },
        { id:'P43', txt:'Possession letter signed and filed', mand:true } ] }
    ];
    const clCatSel = S.clCatSel || CLCATS[0].id;
    const catObj = CLCATS.find(c => c.id === clCatSel) || CLCATS[0];
    const catLists = CLISTS.filter(l => l.catId === clCatSel);
    const clSel = catLists.find(l => l.id === S.clSel) ? S.clSel : (catLists[0] || {}).id;
    const listObj = CLISTS.find(l => l.id === clSel);
    const writeCats = (v) => setS({ clCatList: v });
    const writeLists = (v) => setS({ clListData: v });
    const patchList = (id, patch) => writeLists(CLISTS.map(l => l.id === id ? { ...l, ...patch } : l));
    const nid = (p) => p + Date.now().toString().slice(-6);
    const CLR = [
      { name:'Slab casting QC', pts:10, cat:'Civil', unit:'Skyline · Tower B · Fl 6', who:'S. Kumar', score:92, result:'Pass', state:'Awaiting PM verify' },
      { name:'Toilet waterproofing', pts:5, cat:'Waterproofing', unit:'Skyline · Tower A · Fl 3', who:'R. Manjunath', score:74, result:'Fail', state:'Snag raised · T-1033' },
      { name:'Site safety walk', pts:6, cat:'Safety', unit:'Riverview · site wide', who:'P. Gowda', score:88, result:'Pass', state:'Closed' },
      { name:'Plumbing pressure test', pts:5, cat:'Plumbing', unit:'Skyline · Tower B · Fl 4', who:'S. Kumar', score:100, result:'Pass', state:'Closed' },
      { name:'Unit handover checklist', pts:4, cat:'Handover', unit:'Meadows · Villa C-12', who:'P. Gowda', score:96, result:'Pass', state:'Awaiting PM verify' }
    ];
    const clRuns = CLR.map(r => ({ ...r,
      scoreStyle: bar(r.score, r.score<80?'linear-gradient(90deg,#D8494A,#E8827F)':undefined),
      resStyle: this.pill(r.result==='Pass'?'#177049':'#B23334', r.result==='Pass'?'#E4F6EC':'#FCEDED'),
      stStyle: this.pill(r.state==='Closed'?'#177049':r.state.startsWith('Snag')?'#B23334':'#B4530A', r.state==='Closed'?'#E4F6EC':r.state.startsWith('Snag')?'#FCEDED':'#FDF3E7')
    }));
    // LEADS
    const srcC = { Website:['#0672A6','#E3F2FC'], MagicBricks:['#B4530A','#FDF3E7'], '99acres':['#6A46C8','#EFE9FC'], 'Walk-in':['#177049','#E4F6EC'], Referral:['#B23334','#FCEDED'] };
    const TODAY = '2026-09-06';
    const isoLocal = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    // ===== PROCUREMENT CORE =====
    const fmtD = (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00');
      return String(d.getDate()).padStart(2,'0') + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getFullYear(); };
    const inRange = (iso) => { if (!iso) return !(S.prFrom || S.prTo);
      if (S.prFrom && iso < S.prFrom) return false; if (S.prTo && iso > S.prTo) return false; return true; };
    const hitsQ = (arr) => { const q = (S.prQ || '').trim().toLowerCase(); if (!q) return true;
      return arr.filter(Boolean).some(x => String(x).toLowerCase().includes(q)); };
    const isGone = (kind, id) => (S.deleted || []).includes(kind + ':' + id);
    const rowActs = (kind, ref, id, label) => ({ del: () => setS({ confirmDel: { kind, id, label } }) });
    const fieldRow = (defs, draft, patch) => defs.map(f => ({
      label: f.l, ph: f.ph || '', req: !!f.req, area: !!f.area, isUnit: !!f.unit, notArea: !f.area && !f.unit,
      val: (draft || {})[f.k] || '', change: (e) => patch({ [f.k]: e.target.value }),
      unitSel: (draft || {})[f.k] || '', unitChange: (e) => patch({ [f.k]: e.target.value }),
      unitOpts: (S.uomList || []).map(u => ({ o: u, name: u, u })),
      style: { gridColumn: f.span === 2 ? 'span 2' : 'auto' } }));
    const inr = (n) => n >= 100000 ? '₹' + (n/100000).toFixed(2) + ' L' : '₹' + Number(n).toLocaleString('en-IN');
    const nowStamp = () => '07 Sep 2026, ' + new Date().toTimeString().slice(0,5);
    const NUMFMT = { indent: (n) => 'IND-SKY-' + String(482 + n), po: (n) => 'PO-' + String(2203 + n),
      grn: (n) => 'GRN-' + String(118 + n), vendor: (n) => 'VEN-' + String(20 + n).padStart(3,'0') };
    const nextCode = () => 'ITM-' + String(120 + ((S.itemSeq || 1)));
    const autoNo = (kind) => kind === 'item' ? nextCode() : (NUMFMT[kind] ? NUMFMT[kind](((S.seq || {})[kind]) || 1) : 'NEW-1');
    const mkChain = (stage) => { const names = ['Raised','PM approval','Store stock check','Issued / PO'];
      const shorts = ['R','PM','ST','IS'];
      const step = (k) => ({ font:"800 9px 'Public Sans',sans-serif", borderRadius:'6px', padding:'4px 6px', display:'inline-block',
        color: k === 'wait' ? '#9BA1C2' : '#fff', background: k === 'done' ? '#1F9D66' : k === 'now' ? '#E8A13A' : '#EEF1F8' });
      return names.map((n,i) => ({ name:n, short:shorts[i], style: step(i < stage ? 'done' : i === stage ? 'now' : 'wait'), link: i < 3 })); };
    // ---------- ITEM MASTER ----------
    const items = (S.itemList || [
      { name:'OPC 53 Cement', code:'CEM-001', unit:'Bags', stock:'220', reorder:'400', spec:'IS 269 grade 53, 50 kg bag' },
      { name:'TMT Steel 12 mm Fe550', code:'STL-012', unit:'Ton', stock:'18.4', reorder:'12', spec:'Fe550D, IS 1786' },
      { name:'TMT Steel 16 mm Fe550', code:'STL-016', unit:'Ton', stock:'6.2', reorder:'10', spec:'Fe550D, IS 1786' },
      { name:'M-sand', code:'SND-002', unit:'cft', stock:'1450', reorder:'800', spec:'Washed, zone II' },
      { name:'20 mm aggregate', code:'AGG-003', unit:'cft', stock:'640', reorder:'900', spec:'Crushed granite' },
      { name:'Shuttering plywood 12 mm', code:'PLY-004', unit:'Sheets', stock:'96', reorder:'60', spec:'Film faced, 8x4 ft' },
      { name:'Binding wire', code:'WIR-007', unit:'kg', stock:'340', reorder:'150', spec:'18 gauge annealed' },
      { name:'Emulsion paint · premium', code:'PNT-011', unit:'Litre', stock:'85', reorder:'120', spec:'Interior, low VOC' },
      { name:'Primer · interior', code:'PNT-014', unit:'Litre', stock:'150', reorder:'80', spec:'Water based' },
      { name:'CPVC pipe 25 mm', code:'PLB-021', unit:'Metre', stock:'520', reorder:'300', spec:'SDR 11, hot & cold' },
      { name:'Vitrified tile 600x600', code:'TIL-031', unit:'Boxes', stock:'240', reorder:'150', spec:'Double charged, matt' }
    ]).map(it => { const st = parseFloat(it.stock)||0, rl = parseFloat(it.reorder)||0;
      const low = st < rl, near = !low && st < rl * 1.25;
      const pct = rl ? Math.min(100, Math.round(st / (rl * 1.5) * 100)) : 100;
      return { ...it, low, near, pct,
        flag: low ? 'RESTOCK NOW' : near ? 'ORDER SOON' : 'HEALTHY',
        flagStyle: { display:'inline-flex', font:"800 8.5px 'Public Sans',sans-serif", letterSpacing:'.07em', color:'#fff',
          borderRadius:'99px', padding:'4px 9px', background: low ? '#D8494A' : near ? '#E8A13A' : '#1F9D66' },
        reorderTxt: 'reorder at ' + it.reorder + ' ' + it.unit,
        unitsTxt: it.stock + ' ' + it.unit,
        bar: bar(pct, low ? 'linear-gradient(90deg,#D8494A,#E8827F)' : near ? 'linear-gradient(90deg,#E8A13A,#F2C063)' : undefined),
        lvlStyle: bar(pct, low ? 'linear-gradient(90deg,#D8494A,#E8827F)' : near ? 'linear-gradient(90deg,#E8A13A,#F2C063)' : undefined),
        stockStyle: { font:"800 13px 'Sora',sans-serif", color: low ? '#B23334' : near ? '#B4530A' : '#177049' },
        alert: low }; });
    const ISSUES = (S.issueLog || [
      { code:'CEM-001', type:'ISSUE', qty:'120', at:'05 Sep 2026, 09:40', by:'D. Shetty · Store Manager', to:'R. Manjunath · Slab casting Fl 7', ref:'IND-SKY-0471', note:'Acknowledged on mobile' },
      { code:'CEM-001', type:'ISSUE', qty:'60', at:'01 Sep 2026, 15:10', by:'D. Shetty · Store Manager', to:'S. Kumar · Column shuttering', ref:'IND-SKY-0471', note:'' },
      { code:'STL-012', type:'ISSUE', qty:'2.4', at:'04 Sep 2026, 11:05', by:'K. Hegde · Store Manager', to:'S. Kumar · Rebar Fl 8', ref:'IND-SKY-0479', note:'Cut list attached' },
      { code:'PLY-004', type:'ISSUE', qty:'30', at:'02 Sep 2026, 08:25', by:'D. Shetty · Store Manager', to:'P. Gowda · Deck shuttering', ref:'IND-RIV-0475', note:'' },
      { code:'PLY-004', type:'RETURN', qty:'6', at:'03 Sep 2026, 17:50', by:'P. Gowda · Site Supervisor', to:'Central store', ref:'IND-RIV-0475', note:'Unused sheets returned in good condition' },
      { code:'WIR-007', type:'ISSUE', qty:'40', at:'31 Aug 2026, 10:15', by:'D. Shetty · Store Manager', to:'R. Manjunath · Binding Fl 7', ref:'IND-SKY-0471', note:'' },
      { code:'WIR-007', type:'RETURN', qty:'6', at:'02 Sep 2026, 16:30', by:'R. Manjunath · Site Engineer', to:'Central store', ref:'IND-SKY-0471', note:'Restocked' },
      { code:'SND-002', type:'TRANSFER', qty:'20', at:'29 Aug 2026, 12:00', by:'K. Hegde · Store Manager', to:'Riverview site store', ref:'—', note:'Inter-store transfer, in transit' }
    ]);
    const ledgerOf = (code) => {
      const rows = [];
      GRNDATA.filter(g => !isGone('grn', g.no)).forEach(g => (g.lines||[]).forEach(l => {
        if (l.code !== code) return;
        const q = parseFloat(l.recd) || 0;
        if (q) rows.push({ type:'RECEIPT', qty:q, at: g.receivedAt || fmtD(g.dt), by: g.receiver || g.insp || '—',
          to: g.vendor + ' · against ' + g.po, ref: g.no,
          note: (parseFloat(l.rej)||0) ? l.rej + ' ' + (l.unit||'') + ' rejected at gate' : (g.photo ? 'Challan photo ' + g.photo : '') });
      }));
      ISSUES.filter(x => x.code === code).forEach(x => rows.push({ ...x, qty: parseFloat(x.qty)||0 }));
      const order = { RECEIPT:0, ISSUE:1, RETURN:2, TRANSFER:3 };
      return rows.sort((a,b) => (b.at||'').localeCompare(a.at||'') || order[a.type]-order[b.type]);
    };
    const issuedFor = (ref, code) => ISSUES.filter(x => x.ref === ref && x.code === code)
      .reduce((s,x) => s + ((x.type === 'RETURN' ? -1 : 1) * (parseFloat(x.qty)||0)), 0);
    // ---------- INDENTS ----------
    const ISTAT = { 'Pending PM approval':['#B4530A','#FDF3E7'], 'Pending approval':['#B4530A','#FDF3E7'],
      'Approved':['#0672A6','#E3F2FC'], 'Part-issued':['#6A46C8','#EFE9FC'], 'Issued':['#177049','#E4F6EC'],
      'Closed':['#177049','#E4F6EC'], 'Rejected':['#B23334','#FCEDED'] };
    const IDATA = (S.indentList || [
      { ref:'IND-SKY-0482', title:'OPC 53 Cement · 400 bags', project:'NN Skyline', activity:'Slab casting Fl 8', reqBy:'2026-09-10',
        by:'R. Manjunath · Site Engineer', dt:'2026-09-06', status:'Pending PM approval', stage:1, value:'₹1.58 L', hot:true,
        remarks:'Stock checked at central store — shortfall only',
        lines:[{ name:'OPC 53 Cement', code:'CEM-001', unit:'Bags', qty:'400' }, { name:'Binding wire', code:'WIR-007', unit:'kg', qty:'80' }] },
      { ref:'IND-SKY-0479', title:'TMT Steel 12 mm · 6 Ton', project:'NN Skyline', activity:'Rebar Fl 8', reqBy:'2026-09-09',
        by:'S. Kumar · Site Supervisor', dt:'2026-09-04', status:'Approved', stage:2, value:'₹2.97 L',
        remarks:'BBS attached', lines:[{ name:'TMT Steel 12 mm Fe550', code:'STL-012', unit:'Ton', qty:'6' }] },
      { ref:'IND-RIV-0475', title:'Shuttering plywood · 60 sheets', project:'NN Riverview', activity:'Deck shuttering', reqBy:'2026-09-08',
        by:'P. Gowda · Site Supervisor', dt:'2026-09-02', status:'Part-issued', stage:3, value:'₹94,920',
        remarks:'Balance to come from the new PO',
        lines:[{ name:'Shuttering plywood 12 mm', code:'PLY-004', unit:'Sheets', qty:'60' }] },
      { ref:'IND-SKY-0471', title:'Cement & binding wire', project:'NN Skyline', activity:'Slab casting Fl 7', reqBy:'2026-09-01',
        by:'R. Manjunath · Site Engineer', dt:'2026-08-28', status:'Issued', stage:3, value:'₹1.12 L',
        remarks:'Issued in two lots from central store',
        lines:[{ name:'OPC 53 Cement', code:'CEM-001', unit:'Bags', qty:'180' }, { name:'Binding wire', code:'WIR-007', unit:'kg', qty:'40' }] },
      { ref:'IND-MEA-0468', title:'Emulsion paint · 320 L', project:'NN Meadows', activity:'Villa finishing', reqBy:'2026-09-12',
        by:'M. Iqbal · Site Engineer', dt:'2026-08-25', status:'Closed', stage:4, value:'₹99,840',
        remarks:'Closed against PO-2192', lines:[{ name:'Emulsion paint · premium', code:'PNT-011', unit:'Litre', qty:'320' }] }
    ]);
    const inShortfall = (l) => { const it = items.find(x => x.code === l.code);
      const have = it ? parseFloat(it.stock)||0 : 0, need = parseFloat(l.qty)||0;
      return { have, need, fromStock: Math.min(have, need), short: Math.max(0, need - have) }; };
    const indentFulfil = (o) => { const ls = (o.lines && o.lines.length ? o.lines : [{ name:o.title, code:'—', unit:'', qty:'' }]).map(l => {
        const need = parseFloat(l.qty)||0, done = issuedFor(o.ref, l.code);
        const it = items.find(x => x.code === l.code);
        const have = it ? parseFloat(it.stock)||0 : 0;
        const pending = Math.max(0, need - done);
        return { ...l, need, done, pending, have, canIssue: Math.min(have, pending) }; });
      return { lines: ls, pending: ls.reduce((s,l)=>s+l.pending,0), complete: ls.every(l => l.pending === 0),
        issuable: ls.reduce((s,l)=>s+l.canIssue,0) }; };
    const fulfilState = (o) => { const f = indentFulfil(o);
      const n = f.lines.length;
      const doneLines = f.lines.filter(l => l.pending === 0).length;
      const poLines = f.lines.filter(l => l.pending > l.canIssue).length;
      const readyLines = f.lines.filter(l => l.pending > 0 && l.canIssue > 0).length;
      const noPO = f.pending > 0 && poLines === 0;
      const lineTxt = (c) => c + (c === 1 ? ' line' : ' lines');
      return { key: f.complete ? 'STOCK' : f.issuable > 0 ? 'MIX' : 'PO',
        label: f.complete ? 'FULLY ISSUED' : noPO ? 'ISSUE FROM STOCK' : f.issuable > 0 ? 'PART ISSUE + PO' : 'SHORTFALL → PO',
        style: { display:'inline-flex', font:"800 8.5px 'Public Sans',sans-serif", letterSpacing:'.07em', color:'#fff', borderRadius:'99px', padding:'4px 9px',
          background: f.complete || noPO ? '#1F9D66' : f.issuable > 0 ? '#0089C9' : '#E8A13A' },
        txt: f.complete ? 'All ' + lineTxt(n) + ' issued to site in full'
          : noPO ? doneLines + ' of ' + lineTxt(n) + ' issued · balance available in stock, no PO needed'
          : f.issuable > 0 ? doneLines + ' of ' + lineTxt(n) + ' issued · ' + lineTxt(readyLines) + ' issuable now · ' + lineTxt(poLines) + (poLines === 1 ? ' needs a PO' : ' need a PO')
          : doneLines + ' of ' + lineTxt(n) + ' issued · ' + lineTxt(poLines) + (poLines === 1 ? ' is' : ' are') + ' not in stock — PO required',
        pending: f.pending, complete: f.complete, issuable: f.issuable }; };
    const indents = IDATA.filter(i => !isGone('indent', i.ref) && hitsQ([i.ref,i.title,i.project,i.by,i.activity]) && inRange(i.dt)
        && (S.prA === 'All' || i.project === S.prA) && (S.prB === 'All' || i.status === S.prB))
      .map(i => ({ ...i, dtTxt: fmtD(i.dt), reqBy: fmtD(i.reqBy), chain: mkChain(i.stage),
        ageStyle: { font:"600 10.5px 'Public Sans',sans-serif", color: i.hot ? '#D8494A' : '#9BA1C2' },
        fulfilLabel: fulfilState(i).label, fulfilStyle: fulfilState(i).style, fulfilTxt: fulfilState(i).txt,
        stStyle: this.pill(ISTAT[i.status][0], ISTAT[i.status][1]),
        ...rowActs('indent', { ref:i.ref }, i.ref, i.ref),
        view: () => setS({ inView: i }),
        edit: () => setS({ inBuild:'edit', inDraft: inDraftOf(i), inPick:'' }),
        toPO: () => setS({ inView:null, screen:'pos', poBuild:'new', poPick:'',
          poDraft: { no: autoNo('po'), remarks:'', indents:[i.ref], vendor:'', delivery:'', terms:'30 days credit · delivery at site',
            project: i.project, editing:false,
            lines: (i.lines||[]).map(l => { const sf = inShortfall(l);
              return { name:l.name, code:l.code, unit:l.unit, qty: String(sf.short || l.qty || ''), rate:'', fromIndent:i.ref }; }) } }) }));
    const inDraftOf = (o) => o
      ? { ref:o.ref, project:o.project, activity:o.activity || '', reqBy:o.reqBy || '', remarks:o.remarks || '',
          lines: (o.lines || []).map(l => ({ ...l })), editing:true }
      : { ref: autoNo('indent'), project:'NN Skyline', activity:'', reqBy:'', remarks:'', lines:[], editing:false };
    const ID_ = S.inDraft || inDraftOf(null);
    const iSet = (p) => this.setState(st => ({ inDraft: { ...(st.inDraft || inDraftOf(null)), ...p } }));
    const inPoolFn = () => items.filter(it => !isGone('item', it.code)
      && !(ID_.lines || []).some(l => l.code === it.code)
      && (!S.inPick || (it.name + ' ' + it.code).toLowerCase().includes(S.inPick.toLowerCase())));
    const inSubmit = () => {
      if (!ID_.project || !(ID_.lines || []).length) { this.toast('Pick the project and at least one item'); return; }
      if ((ID_.lines || []).some(l => !l.qty)) { this.toast('Enter the required quantity on every line'); return; }
      const title = ID_.lines.length === 1 ? ID_.lines[0].name + ' · ' + ID_.lines[0].qty + ' ' + (ID_.lines[0].unit||'') : ID_.lines.length + ' items';
      const row = { ref:ID_.ref, title, project:ID_.project, activity:ID_.activity, reqBy:ID_.reqBy, by:S.role,
        dt: TODAY, status:'Pending PM approval', stage:1, value:'—', remarks:ID_.remarks, lines:ID_.lines };
      if (ID_.editing) { setS({ indentList: IDATA.map(x => x.ref === ID_.ref ? { ...x, ...row, status:x.status, stage:x.stage } : x), inBuild:null, inDraft:null });
        this.toast(ID_.ref + ' updated'); }
      else { setS({ indentList: [row, ...IDATA], inBuild:null, inDraft:null, seq: { ...(S.seq||{}), indent: (((S.seq||{}).indent)||1) + 1 } });
        this.toast(ID_.ref + ' raised — sent to the Project Manager'); }
    };
    const isDraftOf = (o) => { const f = indentFulfil(o);
      return { ref:o.ref, project:o.project, activity:o.activity, to:'', by:S.role, remarks:'',
        lines: f.lines.map(l => ({ name:l.name, code:l.code, unit:l.unit||'', need:String(l.need), done:String(l.done),
          pending:String(l.pending), have:String(l.have), qty: l.canIssue ? String(l.canIssue) : '' })) }; };
    const ISD = S.isDraft || { lines: [] };
    const isSet = (p) => this.setState(st => ({ isDraft: { ...(st.isDraft || { lines: [] }), ...p } }));
    const isSubmit = () => {
      const rows = (ISD.lines || []).filter(l => (parseFloat(l.qty)||0) > 0);
      if (!rows.length) { this.toast('Enter the quantity being issued'); return; }
      if (!ISD.to) { this.toast('Enter who the material is issued to'); return; }
      const over = rows.find(l => (parseFloat(l.qty)||0) > Math.min(parseFloat(l.have)||0, parseFloat(l.pending)||0));
      if (over) { this.toast(over.name + ': cannot issue more than stock or pending quantity'); return; }
      const stamp = nowStamp();
      const entries = rows.map(l => ({ code:l.code, type:'ISSUE', qty:String(l.qty), at:stamp,
        by: ISD.by || S.role, to: ISD.to + (ISD.activity ? ' · ' + ISD.activity : ''), ref: ISD.ref, note: ISD.remarks || '' }));
      const nextItems = items.map(it => { const r = rows.find(l => l.code === it.code);
        return r ? { ...it, stock: String(Math.round(((parseFloat(it.stock)||0) - (parseFloat(r.qty)||0)) * 100) / 100) } : it; });
      const src = IDATA.find(x => x.ref === ISD.ref);
      let nextIndents = IDATA;
      if (src) { const stillPending = (src.lines||[]).some(l => {
          const need = parseFloat(l.qty)||0;
          const done = issuedFor(src.ref, l.code) + (parseFloat((rows.find(r=>r.code===l.code)||{}).qty)||0);
          return done < need; });
        nextIndents = IDATA.map(x => x.ref === ISD.ref ? { ...x, status: stillPending ? 'Part-issued' : 'Issued', stage: stillPending ? 3 : 4 } : x); }
      setS({ isBuild:null, isDraft:null, itemList: nextItems, issueLog: [...entries, ...ISSUES], indentList: nextIndents, inView: null });
      this.toast(rows.length + (rows.length===1?' item':' items') + ' issued to ' + ISD.to + ' against ' + ISD.ref);
    };
    // ---------- PURCHASE ORDERS ----------
    const PO_ST = { 'Pending PM approval':['#B4530A','#FDF3E7'], 'Pending admin approval':['#6A46C8','#EFE9FC'],
      'Approved · sent to vendor':['#0672A6','#E3F2FC'], 'Partially received':['#B4530A','#FDF3E7'],
      'Closed · matched':['#177049','#E4F6EC'], 'Rejected':['#B23334','#FCEDED'] };
    const PODATA = (S.poList || [
      { no:'PO-2203', lines:[{ name:'TMT Steel 12 mm Fe550', code:'STL-012', unit:'Ton', qty:'8', rate:'49470' }],
        indent:'IND-SKY-0479', indents:['IND-SKY-0479'], vendor:'SteelCorp Traders', project:'NN Skyline', items:'TMT steel 12 mm · 8 Ton',
        value:'₹3.96 L', dt:'2026-09-05', delivery:'Due 09 Sep', del:'', terms:'30 days credit · delivery at site',
        status:'Pending PM approval', createdBy:'D. Shetty · Store Manager', createdAt:'05 Sep 2026, 10:12' },
      { no:'PO-2201', lines:[{ name:'Shuttering plywood 12 mm', code:'PLY-004', unit:'Sheets', qty:'60', rate:'1582' }],
        indent:'IND-RIV-0475', indents:['IND-RIV-0475'], vendor:'Kiran Plywood', project:'NN Riverview', items:'Plywood 12 mm · 60 sheets',
        value:'₹94,920', dt:'2026-09-03', delivery:'Due 08 Sep', del:'', terms:'Advance 50%',
        status:'Pending admin approval', createdBy:'D. Shetty · Store Manager', createdAt:'03 Sep 2026, 15:40',
        pmBy:'Anil Deshpande', pmAt:'04 Sep 2026, 09:20' },
      { no:'PO-2198', lines:[{ name:'TMT Steel 16 mm Fe550', code:'STL-016', unit:'Ton', qty:'12', rate:'48305' }],
        indent:'—', indents:[], vendor:'SteelCorp Traders', project:'NN Skyline', items:'TMT steel 16 mm · 12 Ton',
        value:'₹5.80 L', dt:'2026-08-26', delivery:'Received 28 Aug', del:'done', terms:'30 days credit',
        status:'Partially received', createdBy:'K. Hegde · Store Manager', createdAt:'26 Aug 2026, 11:05',
        pmBy:'Anil Deshpande', pmAt:'26 Aug 2026, 14:10', admBy:'Owner / Admin', admAt:'26 Aug 2026, 17:35' },
      { no:'PO-2195', lines:[{ name:'20 mm aggregate', code:'AGG-003', unit:'cft', qty:'140', rate:'581' }],
        indent:'—', indents:[], vendor:'Suresh Aggregates', project:'NN Skyline', items:'20 mm aggregate · 140 cft',
        value:'₹81,340', dt:'2026-08-22', delivery:'Late by 3 days', del:'late', terms:'Cash on delivery',
        status:'Approved · sent to vendor', createdBy:'D. Shetty · Store Manager', createdAt:'22 Aug 2026, 09:15',
        pmBy:'Anil Deshpande', pmAt:'22 Aug 2026, 12:00', admBy:'Owner / Admin', admAt:'22 Aug 2026, 16:20' },
      { no:'PO-2192', lines:[{ name:'Emulsion paint · premium', code:'PNT-011', unit:'Litre', qty:'320', rate:'312' },
          { name:'Primer · interior', code:'PNT-014', unit:'Litre', qty:'90', rate:'190' }],
        indent:'IND-MEA-0468', indents:['IND-MEA-0468'], vendor:'Farida Paints', project:'NN Meadows', items:'Paint & primer · 410 L',
        value:'₹1.17 L', dt:'2026-08-18', delivery:'Received 24 Aug', del:'done', terms:'15 days credit',
        status:'Closed · matched', createdBy:'M. Iqbal · Site Engineer', createdAt:'18 Aug 2026, 10:40',
        pmBy:'Meera Krishnan', pmAt:'18 Aug 2026, 15:10', admBy:'Owner / Admin', admAt:'19 Aug 2026, 09:05' }
    ]);
    const lineTotal = (l) => (parseFloat(l.qty)||0) * (parseFloat(l.rate)||0);
    const poLinesOf = (o) => (o.lines && o.lines.length) ? o.lines : [{ name:o.items || '—', code:'—', unit:'', qty:'', rate:'' }];
    const poFill = (o) => ({ ...o, st: PO_ST[o.status] || ['#5A6080','#F1F4FB'] });
    const poDraftOf = (o) => o
      ? { no:o.no, indents: o.indents || (o.indent && o.indent !== '—' ? [o.indent] : []), vendor:o.vendor || '',
          project:o.project || 'NN Skyline', delivery:o.delivery || '', terms:o.terms || '', remarks:o.remarks || '',
          lines: poLinesOf(o).map(l => ({ ...l })), editing:true, rev: (o.rev || 0) }
      : { no: autoNo('po'), indents:[], vendor:'', project:'NN Skyline', delivery:'', terms:'30 days credit · delivery at site',
          remarks:'', lines:[], editing:false, rev:0 };
    const D = S.poDraft || poDraftOf(null);
    const dSet = (p) => this.setState(st => ({ poDraft: { ...(st.poDraft || poDraftOf(null)), ...p } }));
    const poPoolFn = () => items.filter(it => !isGone('item', it.code)
      && !(D.lines || []).some(l => l.code === it.code)
      && (!S.poPick || (it.name + ' ' + it.code).toLowerCase().includes(S.poPick.toLowerCase())));
    const poSubtotal = (D.lines || []).reduce((s,l) => s + lineTotal(l), 0);
    const poGst = Math.round(poSubtotal * 0.18);
    const poGrand = poSubtotal + poGst;
    const poSubmit = () => {
      if (!D.vendor) { this.toast('Select the vendor'); return; }
      if (!(D.lines || []).length) { this.toast('Add at least one item from the item master'); return; }
      if ((D.lines || []).some(l => !l.qty || !l.rate)) { this.toast('Enter quantity and rate on every line'); return; }
      const row = { no:D.no, indents:D.indents, indent: (D.indents && D.indents.length) ? D.indents.join(' · ') : '—',
        vendor:D.vendor, project:D.project, lines:D.lines, terms:D.terms, remarks:D.remarks,
        items: D.lines.length === 1 ? D.lines[0].name + ' · ' + D.lines[0].qty + ' ' + (D.lines[0].unit||'') : D.lines.length + ' items',
        value: inr(poSubtotal), dt: TODAY, delivery: D.delivery || 'To be confirmed', del:'',
        status:'Pending PM approval', createdBy: S.role, createdAt: nowStamp() };
      if (D.editing) {
        const src = PODATA.find(p => p.no === D.no) || {};
        const rev = (src.rev || 0) + 1;
        setS({ poBuild:null, poDraft:null, poList: PODATA.map(p => p.no !== D.no ? p : { ...p, ...row,
          rev, pmBy:null, pmAt:null, admBy:null, admAt:null, status:'Pending PM approval',
          createdBy: src.createdBy, createdAt: src.createdAt,
          editLog: [...(src.editLog||[]), { what:'Revision ' + rev + ' — lines or terms changed', by:S.role, at:nowStamp() }] }) });
        this.toast(D.no + ' revised — approval restarts at the Project Manager');
      } else {
        setS({ poBuild:null, poDraft:null, poList: [row, ...PODATA], seq: { ...(S.seq||{}), po: (((S.seq||{}).po)||1) + 1 } });
        this.toast(D.no + ' raised — sent to the Project Manager');
      }
    };
    const poApprove = (o) => () => {
      if (o.status === 'Pending PM approval') {
        setS({ poList: PODATA.map(p => p.no !== o.no ? p : { ...p, status:'Pending admin approval', pmBy:S.role, pmAt:nowStamp() }) });
        this.toast(o.no + ' approved by Project Manager — waiting for Admin');
      } else if (o.status === 'Pending admin approval') {
        setS({ poList: PODATA.map(p => p.no !== o.no ? p : { ...p, status:'Approved · sent to vendor', admBy:S.role, admAt:nowStamp() }) });
        this.toast(o.no + ' approved by Admin — sent to ' + o.vendor);
      }
    };
    const poApprovedList = () => PODATA.filter(p => !isGone('po', p.no)
      && ['Approved · sent to vendor','Partially received','Closed · matched'].includes(p.status)).map(poFill);
    const grnsOfPO = (poNo, exclude) => GRNDATA.filter(g => g.po === poNo && !isGone('grn', g.no) && g.no !== exclude);
    const recdSoFar = (poNo, code, exclude) => grnsOfPO(poNo, exclude).reduce((s,g) =>
      s + (g.lines||[]).filter(l => l.code === code).reduce((a,l) => a + (parseFloat(l.recd)||0) + (parseFloat(l.rej)||0), 0), 0);
    const poFulfil = (o, exclude) => { const ls = poLinesOf(o).map(l => {
        const ord = parseFloat(l.qty)||0, got = recdSoFar(o.no, l.code, exclude);
        return { ...l, ordered: ord, already: got, balance: Math.max(0, ord - got) }; });
      return { lines: ls, pending: ls.reduce((s,l)=>s+l.balance,0), complete: ls.every(l => l.balance === 0) }; };
    const pos = PODATA.filter(p => !isGone('po', p.no) && hitsQ([p.no,p.vendor,p.items,p.indent,p.project]) && inRange(p.dt)
        && (S.prA === 'All' || p.vendor === S.prA) && (S.prB === 'All' || p.status === S.prB))
      .map(poFill).map(o => { const canPM = o.status === 'Pending PM approval', canAdm = o.status === 'Pending admin approval';
        return { ...o, dtTxt: fmtD(o.dt),
          apLabel: canPM ? '✓ PM approve' : '✓ Admin approve', appr: canPM || canAdm,
          apStyle: { border:'none', background: canPM ? '#E8A13A' : '#6A46C8', color:'#fff', font:"700 10.5px 'Public Sans',sans-serif", borderRadius:'7px', padding:'6px 11px', cursor:'pointer' },
          approve: poApprove(o),
          revTxt: o.rev ? 'rev ' + o.rev : '', hasRev: !!o.rev,
          revStyle: {...this.pill('#B4530A','#FDF3E7'), fontSize:'9.5px', letterSpacing:'.05em'},
          auditTxt: (o.admBy ? 'approved ' + o.admBy : o.pmBy ? 'PM ✓ ' + o.pmBy : 'raised ' + o.createdBy),
          delStyle: { font:"600 12px 'Public Sans',sans-serif", color: o.del==='late'?'#D8494A':o.del==='done'?'#177049':'#3A3F5C' },
          stStyle: this.pill(o.st[0], o.st[1]),
          ...rowActs('po', { no:o.no }, o.no, o.no),
          view: () => setS({ poView: o }),
          edit: () => setS({ poBuild:'edit', poDraft: poDraftOf(o), poPick:'' }),
          print: () => setS({ poPrint: o }) }; });
    // ---------- GOODS RECEIPT ----------
    const GRNDATA = (S.grnList || [
      { no:'GRN-118', po:'PO-2198', vendor:'SteelCorp Traders', item:'TMT steel 16 mm · 6.2 of 12 Ton',
        lines:[{ name:'TMT Steel 16 mm Fe550', code:'STL-016', unit:'Ton', ordered:'12', recd:'6.2', rej:'0' }],
        receiver:'K. Hegde', receivedAt:'28 Aug 2026, 11:20', photo:'challan-4412.jpg', invoiceNo:'INV-2026-4188',
        insp:'K. Hegde', acc:'6.2 Ton', rej:'', short:'5.8 Ton', dt:'2026-08-28',
        match:'Part receipt — balance pending', mc:['#B4530A','#FDF3E7'], remarks:'Balance promised next week' },
      { no:'GRN-117', po:'PO-2192', vendor:'Farida Paints', item:'Paint & primer · 410 L',
        lines:[{ name:'Emulsion paint · premium', code:'PNT-011', unit:'Litre', ordered:'320', recd:'320', rej:'0' },
          { name:'Primer · interior', code:'PNT-014', unit:'Litre', ordered:'90', recd:'90', rej:'0' }],
        receiver:'D. Shetty', receivedAt:'24 Aug 2026, 09:05', photo:'challan-4390.jpg', invoiceNo:'INV-2026-4102',
        insp:'D. Shetty', acc:'410 L', rej:'', short:'', dt:'2026-08-24',
        match:'Received & matched ✓', mc:['#177049','#E4F6EC'], remarks:'' },
      { no:'GRN-115', po:'PO-2185', vendor:'Sri Balaji Agencies', item:'OPC 53 cement · 400 bags',
        lines:[{ name:'OPC 53 Cement', code:'CEM-001', unit:'Bags', ordered:'400', recd:'360', rej:'40' }],
        receiver:'D. Shetty', receivedAt:'16 Aug 2026, 16:40', photo:'challan-4388.jpg',
        insp:'D. Shetty', acc:'360 Bags', rej:'40 Bags', short:'', dt:'2026-08-16',
        match:'Mismatch — invoice blocked', mc:['#B23334','#FCEDED'], remarks:'40 bags torn at gate, debit note raised' }
    ]);
    const grNum = (v) => parseFloat(v) || 0;
    const grDraftOf = (o) => o
      ? { no:o.no, po:o.po, poRec: PODATA.filter(p => p.no === o.po).map(poFill)[0] || null,
          receiver:o.receiver || '', photo:o.photo || '', remarks:o.remarks || '', invoiceNo:o.invoiceNo || '',
          invoiceLater: !o.invoiceNo, lines: (o.lines || []).map(l => ({ ...l })), editing:true }
      : { no: autoNo('grn'), po:'', poRec:null, receiver:'', photo:'', remarks:'', invoiceNo:'', invoiceLater:true, lines:[], editing:false };
    const GRD = S.grDraft || grDraftOf(null);
    const gSet = (p) => this.setState(st => ({ grDraft: { ...(st.grDraft || grDraftOf(null)), ...p } }));
    const grShort = (l) => Math.max(0, (l.balance !== undefined ? grNum(l.balance) : grNum(l.ordered)) - grNum(l.recd) - grNum(l.rej));
    const grTotals = () => (GRD.lines || []).reduce((t,l) => ({
      ordered: t.ordered + grNum(l.ordered), recd: t.recd + grNum(l.recd),
      rej: t.rej + grNum(l.rej), short: t.short + grShort(l) }), { ordered:0, recd:0, rej:0, short:0 });
    const grPickPO = (o) => () => { const f = poFulfil(o, GRD.editing ? GRD.no : null);
      if (f.complete) { this.toast(o.no + ' is already fully received — nothing pending'); return; }
      gSet({ po:o.no, poRec:o, lines: f.lines.map(l => ({ name:l.name, code:l.code, unit:l.unit||'',
        ordered:String(l.ordered), already:String(l.already), balance:String(l.balance), recd:'', rej:'' })) }); };
    const grSubmit = () => {
      if (!GRD.po) { this.toast('Enter the approved PO number first'); return; }
      if (!GRD.receiver) { this.toast('Enter who received the material'); return; }
      const rows = (GRD.lines || []).filter(l => grNum(l.recd) > 0 || grNum(l.rej) > 0);
      if (!rows.length) { this.toast('Enter the actual quantity received'); return; }
      const t = grTotals();
      const unit = (GRD.lines[0] || {}).unit || '';
      const src = PODATA.filter(p => p.no === GRD.po)[0];
      const after = src ? poLinesOf(src).every(l => {
        const ord = parseFloat(l.qty)||0;
        const prior = recdSoFar(GRD.po, l.code, GRD.editing ? GRD.no : null);
        const nowLine = (GRD.lines || []).filter(x => x.code === l.code).reduce((a,x) => a + grNum(x.recd) + grNum(x.rej), 0);
        return prior + nowLine >= ord; }) : false;
      const row = { no:GRD.no, po:GRD.po, vendor: (GRD.poRec || {}).vendor || (src||{}).vendor || '—',
        item: rows.length === 1 ? rows[0].name + ' · ' + rows[0].recd + ' ' + (rows[0].unit||'') : rows.length + ' items',
        lines: GRD.lines, receiver: GRD.receiver, receivedAt: nowStamp(), photo: GRD.photo,
        insp: GRD.receiver, remarks: GRD.remarks, invoiceNo: GRD.invoiceLater ? '' : GRD.invoiceNo,
        acc: t.recd + ' ' + unit, rej: t.rej ? t.rej + ' ' + unit : '', short: t.short ? t.short + ' ' + unit : '',
        match: t.rej ? 'Mismatch — invoice blocked' : t.short ? 'Part receipt — balance pending' : 'Received & matched ✓',
        mc: t.rej ? ['#B23334','#FCEDED'] : t.short ? ['#B4530A','#FDF3E7'] : ['#177049','#E4F6EC'],
        dt: TODAY };
      const nextItems = items.map(it => { const r = rows.find(l => l.code === it.code);
        return r ? { ...it, stock: String(Math.round(((parseFloat(it.stock)||0) + grNum(r.recd)) * 100) / 100) } : it; });
      const poStatus = after ? 'Closed · matched' : 'Partially received';
      setS({ grBuild:null, grDraft:null, itemList: nextItems,
        grnList: GRD.editing ? GRNDATA.map(x => x.no === GRD.no ? row : x) : [row, ...GRNDATA],
        poList: PODATA.map(p => p.no !== GRD.po ? p : { ...p, status: poStatus, delivery:'Received ' + fmtD(TODAY), del:'done' }),
        seq: GRD.editing ? S.seq : { ...(S.seq||{}), grn: (((S.seq||{}).grn)||1) + 1 } });
      this.toast(GRD.no + ' created — stock updated' + (after ? ' · PO closed' : ' · balance still pending'));
    };
    const grns = GRNDATA.filter(g => !isGone('grn', g.no) && hitsQ([g.no,g.po,g.vendor,g.item,g.insp,g.receiver]) && inRange(g.dt)
        && (S.prA === 'All' || g.vendor === S.prA) && (S.prB === 'All' || (S.prB === 'Invoice pending' ? !g.invoiceNo : !!g.invoiceNo)))
      .map(g => ({ ...g, dtTxt: fmtD(g.dt), matchStyle: this.pill(g.mc[0], g.mc[1]),
        ...rowActs('grn', { no:g.no }, g.no, g.no),
        edit: () => setS({ grBuild:'edit', grDraft: grDraftOf(g), grPick:'' }),
        view: () => setS({ grView: g }) }));
    // ---------- VENDORS ----------
    const VNF = [
      { k:'name', l:'Vendor name', ph:'Sri Balaji Agencies', req:true, span:2 },
      { k:'contact', l:'Contact person', ph:'B. Ramesh' },
      { k:'mobile', l:'Mobile number', ph:'98450 00000', req:true },
      { k:'email', l:'Email', ph:'sales@vendor.in' },
      { k:'gst', l:'GSTIN', ph:'29ABCDE1234F1Z5' },
      { k:'pan', l:'PAN', ph:'ABCDE1234F' },
      { k:'terms', l:'Payment terms', ph:'30 days credit' },
      { k:'acct', l:'Bank account number', ph:'50100234567890' },
      { k:'ifsc', l:'IFSC code', ph:'HDFC0001234' },
      { k:'bankName', l:'Bank & branch', ph:'HDFC Bank · Mysore Road' },
      { k:'upi', l:'UPI ID', ph:'sribalaji@okhdfcbank' },
      { k:'addr', l:'Address', ph:'Yard address, city', span:2, area:true }
    ];
    const VDATA = (S.vendorList || [
      { code:'VEN-004', name:'SteelCorp Traders', contact:'A. Ravindran', mobile:'98450 11234', email:'sales@steelcorp.in',
        cats:'TMT & structural steel', gst:'29AABCS1429B1Z8', pan:'AABCS1429B', terms:'30 days credit',
        acct:'50100234567890', ifsc:'HDFC0001234', bankName:'HDFC Bank · Peenya', upi:'steelcorp@okhdfcbank',
        addr:'Plot 42, Peenya Industrial Area, Bengaluru', rating:'4.6', ontime:'94%', pos:'18', spend:'₹4.2 Cr', status:'Active' },
      { code:'VEN-007', name:'Sri Balaji Agencies', contact:'B. Ramesh', mobile:'98860 44521', email:'balaji.agencies@gmail.com',
        cats:'Cement · Aggregates', gst:'29AAGFS8842K1ZP', pan:'AAGFS8842K', terms:'15 days credit',
        acct:'0987654321', ifsc:'ICIC0000456', bankName:'ICICI Bank · Whitefield', upi:'balaji@okicici',
        addr:'Survey 88, Whitefield Road, Bengaluru', rating:'4.1', ontime:'86%', pos:'26', spend:'₹2.8 Cr', status:'Active' },
      { code:'VEN-011', name:'Kiran Plywood', contact:'Kiran Shetty', mobile:'99450 78210', email:'kiranply@outlook.com',
        cats:'Plywood & shuttering', gst:'29AACFK5521M1ZR', pan:'AACFK5521M', terms:'Advance 50%',
        acct:'3344556677', ifsc:'SBIN0004321', bankName:'SBI · Yeshwanthpur', upi:'kiranply@oksbi',
        addr:'Timber Yard, Yeshwanthpur, Bengaluru', rating:'4.3', ontime:'91%', pos:'9', spend:'₹86 L', status:'Active' },
      { code:'VEN-013', name:'Suresh Aggregates', contact:'Suresh N.', mobile:'94480 55192', email:'sureshagg@gmail.com',
        cats:'Aggregates · Sand', gst:'29AXVPS1121J1ZK', pan:'AXVPS1121J', terms:'Cash on delivery',
        acct:'2211334455', ifsc:'KKBK0008899', bankName:'Kotak · Hoskote', upi:'suresh@okaxis',
        addr:'Quarry Road, Hoskote', rating:'3.7', ontime:'78%', pos:'14', spend:'₹1.1 Cr', status:'On hold' },
      { code:'VEN-016', name:'Farida Paints', contact:'Farida Begum', mobile:'90080 33471', email:'orders@faridapaints.in',
        cats:'Paints & finishes', gst:'29AAFCF9931L1ZQ', pan:'AAFCF9931L', terms:'15 days credit',
        acct:'6677889900', ifsc:'HDFC0009087', bankName:'HDFC Bank · Shivajinagar', upi:'farida@okhdfcbank',
        addr:'Commercial Street, Bengaluru', rating:'4.5', ontime:'96%', pos:'11', spend:'₹64 L', status:'Active' }
    ]);
    const VND = S.vnDraft || {};
    const vPatch = (p) => this.setState(st => ({ vnDraft: { ...(st.vnDraft || {}), ...p } }));
    const vnSave = () => { const f = VND;
      if (!f.name || !f.mobile) { this.toast('Vendor name and mobile number are required'); return; }
      const catStr = (f.catList && f.catList.length) ? f.catList.join(' · ') : (f.cats || '');
      if (S.vnBuild === 'edit') {
        setS({ vnBuild:null, vnDraft:null, vendorList: VDATA.map(x => (x.code && x.code === f.code) || x.name === f.name ? { ...x, ...f, cats: catStr } : x) });
        this.toast('Vendor updated');
      } else {
        const code = autoNo('vendor');
        setS({ vnBuild:null, vnDraft:null, seq: { ...(S.seq||{}), vendor: (((S.seq||{}).vendor)||1) + 1 },
          vendorList: [{ code, ...f, cats: catStr, rating:'—', ontime:'—', pos:'0', spend:'₹0', status:'Active' }, ...VDATA] });
        this.toast('Vendor "' + f.name + '" created · ' + code);
      } };
    // ---------- ITEM BUILDER ----------
    const ITF = [
      { k:'name', l:'Item name', ph:'OPC 53 Cement', req:true, span:2 },
      { k:'unit', l:'Unit of measure', ph:'Bags', req:true, unit:true },
      { k:'stock', l:'Available stock', ph:'220' },
      { k:'reorder', l:'Reorder level', ph:'400' },
      { k:'spec', l:'Specification', ph:'IS 269 grade 53, 50 kg bag', span:2, area:true }
    ];
    const ITD = S.itDraft || {};
    const iPatch = (p) => this.setState(st => ({ itDraft: { ...(st.itDraft || {}), ...p } }));
    const itSave = () => { const f = ITD;
      if (!f.name || !f.unit) { this.toast('Item name and unit are required'); return; }
      if (S.itBuild === 'edit') {
        setS({ itBuild:null, itDraft:null, itemList: items.map(x => x.code === f.code ? { ...x, ...f } : x) });
        this.toast('"' + f.name + '" updated');
      } else {
        const code = nextCode();
        setS({ itBuild:null, itDraft:null, itemSeq:(S.itemSeq||1)+1,
          itemList: [{ name:f.name, code, unit:f.unit, stock:f.stock||'0', reorder:f.reorder||'0', spec:f.spec||'' }, ...items] });
        this.toast('"' + f.name + '" created · code ' + code);
      } };
    const stock = [];
    const moves = [];
    const KINDN = { item:'item', vendor:'vendor', indent:'indent', po:'purchase order', grn:'goods receipt',
      store:'store', tax:'unit', user:'user', limit:'approval limit', kb:'knowledge base article', employee:'employee' };
    const prActive = !!(S.prQ || S.prFrom || S.prTo || (S.prA && S.prA !== 'All') || (S.prB && S.prB !== 'All'));
    const prClear = () => setS({ prQ:'', prFrom:'', prTo:'', prA:'All', prB:'All' });
    // ---------- GENERIC MASTER FORMS ----------
    const PCDEF = {
      indent: { title:'Requirement Indent', fields:[
        {k:'project',l:'Project',ph:'NN Skyline',req:true},{k:'title',l:'Item & quantity',ph:'OPC 53 Cement · 400 bags',req:true},
        {k:'activity',l:'Linked activity',ph:'Slab casting Fl 7'},{k:'reqBy',l:'Required by',ph:'2026-09-10',req:true},
        {k:'by',l:'Raised by',ph:'R. Manjunath'},{k:'remarks',l:'Remarks',ph:'Stock checked — shortfall only',area:true,span:2} ] },
      po: { title:'Purchase Order', fields:[
        {k:'vendor',l:'Vendor',ph:'SteelCorp Traders',req:true},{k:'items',l:'Items',ph:'TMT steel 12 mm · 8 Ton',req:true},
        {k:'value',l:'Order value',ph:'₹3.96 L'},{k:'delivery',l:'Delivery',ph:'Due 09 Sep'},
        {k:'terms',l:'Payment terms',ph:'30 days credit'},{k:'remarks',l:'Remarks',ph:'',area:true,span:2} ] },
      grn: { title:'Goods Receipt', fields:[
        {k:'po',l:'Against PO',ph:'PO-2198',req:true},{k:'vendor',l:'Vendor',ph:'SteelCorp Traders'},
        {k:'item',l:'Material',ph:'TMT steel 16 mm'},{k:'acc',l:'Accepted',ph:'6.2 Ton',req:true},
        {k:'rej',l:'Rejected',ph:'0'},{k:'remarks',l:'Remarks',ph:'',area:true,span:2} ] },
      item: { title:'Item', fields:[
        {k:'name',l:'Item name',ph:'OPC 53 Cement',req:true},{k:'unit',l:'Unit',ph:'Bags',req:true,unit:true},
        {k:'stock',l:'Available stock',ph:'220'},{k:'reorder',l:'Reorder level',ph:'400'},
        {k:'spec',l:'Specification',ph:'IS 269 grade 53',area:true,span:2} ] },
      vendor: { title:'Vendor', fields:[
        {k:'name',l:'Vendor name',ph:'Sri Balaji Agencies',req:true},{k:'mobile',l:'Mobile number',ph:'98450 00000',req:true},
        {k:'cats',l:'Supply categories',ph:'Cement · Aggregates'},{k:'terms',l:'Payment terms',ph:'30 days credit'},
        {k:'addr',l:'Address',ph:'Yard address, city',area:true,span:2} ] }
    };
    const pcOpen = (kind, mode, row) => setS({ pcForm:kind, pcMode:mode, pcFields: row || {} });
    const pcDef = PCDEF[S.pcForm || 'item'] || PCDEF.item;
    const pcFormFields = fieldRow(pcDef.fields, S.pcFields || {}, (p) => this.setState(st => ({ pcFields: { ...(st.pcFields||{}), ...p } })));
    const pcVw = S.pcView;
    const pcViewRows = pcVw ? (PCDEF[pcVw.kind] || PCDEF.item).fields.map(f => ({ k:f.l, v: (pcVw.row || {})[f.k] || '—' })) : [];
    const pcDelNow = (kind, id, label) => { setS({ deleted: [...(S.deleted||[]), kind + ':' + id], confirmDel:null, pcView:null });
      this.toast((label || id) + ' deleted'); };
    // ===== SCHEDULE =====
    const SCHED = S.schedList || [
      { id:'M1', project:'NN Skyline', tower:'Tower B', name:'Earth Work', pm:'Anil Deshpande', subs:[
        { id:'M1S1', name:'Site clearing & levelling', ps:'2026-06-01', pe:'2026-06-06', as:'2026-06-01', ae:'2026-06-06', status:'Completed' },
        { id:'M1S2', name:'Excavation', ps:'2026-06-08', pe:'2026-06-20', as:'2026-06-08', ae:'2026-06-24', status:'Completed',
          exts:[{ id:'E1', days:'4', reason:'Hard rock strata at NE corner', by:'R. Manjunath · Site Engineer', at:'18 Jun 2026, 10:20', pmStatus:'Approved', pmRemark:'Verified on site, rock breaker deployed', pmBy:'Anil Deshpande', pmAt:'18 Jun 2026, 14:05', admStatus:'Approved', admRemark:'Genuine ground condition, not foreseeable', admBy:'Owner / Admin', admAt:'19 Jun 2026, 09:10', newEnd:'2026-06-24', verdict:'Genuine' }] },
        { id:'M1S3', name:'Anti-termite & PCC', ps:'2026-06-22', pe:'2026-06-28', as:'2026-06-26', ae:'2026-06-30', status:'Completed' } ] },
      { id:'M2', project:'NN Skyline', tower:'Tower B', name:'RCC', pm:'Anil Deshpande', subs:[
        { id:'M2S1', name:'Footing', ps:'2026-07-01', pe:'2026-07-14', as:'2026-07-01', ae:'2026-07-14', status:'Completed' },
        { id:'M2S2', name:'Plinth beam & backfill', ps:'2026-07-15', pe:'2026-07-28', as:'2026-07-16', ae:'2026-07-30', status:'Completed' },
        { id:'M2S3', name:'Slab 1', ps:'2026-08-01', pe:'2026-08-18', as:'2026-08-01', ae:'2026-08-22', status:'Completed',
          exts:[{ id:'E2', days:'4', reason:'Rebar delivery delayed by vendor', by:'R. Manjunath · Site Engineer', at:'16 Aug 2026, 16:40', pmStatus:'Approved', pmRemark:'Vendor short-supplied, replacement PO raised', pmBy:'Anil Deshpande', pmAt:'17 Aug 2026, 09:30', admStatus:'Approved', admRemark:'Procurement follow-up was late — avoidable', admBy:'Owner / Admin', admAt:'17 Aug 2026, 18:00', newEnd:'2026-08-22', verdict:'Avoidable' }] },
        { id:'M2S4', name:'Slab 2', ps:'2026-08-20', pe:'2026-09-05', as:'2026-08-24', status:'In progress',
          exts:[{ id:'E3', days:'5', reason:'Continuous rain — 3 pour days lost', by:'S. Kumar · Site Supervisor', at:'05 Sep 2026, 08:15', pmStatus:'Approved', pmRemark:'Rain days confirmed from the site log', pmBy:'Anil Deshpande', pmAt:'05 Sep 2026, 11:00', admStatus:'Pending' }] },
        { id:'M2S5', name:'Slab 3', ps:'2026-09-07', pe:'2026-09-24', status:'Not started' },
        { id:'M2S6', name:'Staircase & lift wall', ps:'2026-09-10', pe:'2026-09-30', status:'Not started' } ] },
      { id:'M3', project:'NN Skyline', tower:'Tower B', name:'Block work', pm:'Anil Deshpande', subs:[
        { id:'M3S1', name:'Block work · Fl 1–3', ps:'2026-09-04', pe:'2026-09-20', status:'Not started' } ] },
      { id:'M4', project:'NN Riverview', tower:'Tower A', name:'Earth Work', pm:'Meera Krishnan', subs:[
        { id:'M4S1', name:'Excavation', ps:'2026-08-10', pe:'2026-08-26', as:'2026-08-10', ae:'2026-08-26', status:'Completed' },
        { id:'M4S2', name:'PCC & raft', ps:'2026-08-28', pe:'2026-09-18', as:'2026-08-28', status:'In progress' } ] },
      { id:'M5', project:'NN Meadows', tower:'Phase 1', name:'Villa foundations', pm:'Prakash Rao', subs:[
        { id:'M5S1', name:'Villas 1–8 footing', ps:'2026-09-02', pe:'2026-09-16', as:'2026-09-04', status:'In progress',
          exts:[{ id:'E4', days:'3', reason:'Labour shortage after the festival week', by:'P. Gowda · Site Supervisor', at:'06 Sep 2026, 17:30', pmStatus:'Pending' }] },
        { id:'M5S2', name:'Villas 9–16 footing', ps:'2026-09-05', pe:'2026-09-22', status:'Not started' } ] }
    ];
    const dSpan = (a,b) => (a && b) ? Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000) + 1 : 0;
    const dGap = (a,b) => (a && b) ? Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000) : null;
    const minD = (a) => a.filter(Boolean).sort()[0] || '';
    const maxD = (a) => a.filter(Boolean).sort().slice(-1)[0] || '';
    const grantedExts = (s) => (s.exts||[]).filter(e => e.admStatus === 'Approved');
    const revEnd = (s) => { const g = grantedExts(s); return g.length ? maxD(g.map(e=>e.newEnd)) : s.pe; };
    const extDays = (s) => grantedExts(s).reduce((n,e) => n + (parseInt(e.days)||0), 0);
    const pendExt = (s) => (s.exts||[]).find(e => e.pmStatus === 'Pending' || (e.pmStatus === 'Approved' && e.admStatus === 'Pending'));
    const sMetrics = (s) => { const re = revEnd(s);
      const done = s.status === 'Completed';
      return { re, planDays: dSpan(s.ps, s.pe), revDays: dSpan(s.ps, re), actDays: dSpan(s.as, s.ae),
        startVar: dGap(s.ps, s.as), endVar: dGap(s.pe, s.ae), revVar: dGap(re, s.ae),
        onStart: !!s.as && s.as <= s.ps, onDone: done && !!s.ae && s.ae <= re,
        overdue: !done && re < TODAY, dueToday: !done && re === TODAY,
        startToday: !s.as && s.ps === TODAY, startDue: !s.as && s.ps < TODAY,
        ext: extDays(s), pend: pendExt(s) }; };
    const SST = { 'Completed':['#177049','#E4F6EC'], 'In progress':['#0672A6','#E3F2FC'], 'Not started':['#5A6080','#F1F4FB'] };
    const schKeyOf = (m) => m.project + ' · ' + m.tower;
    const schProjs = [...new Set(SCHED.map(schKeyOf))];
    const schKey = S.schProj || schProjs[0];
    const schMains = SCHED.filter(m => schKeyOf(m) === schKey);
    const schWrite = (list) => setS({ schedList: list });
    const patchSub = (mid, sid, patch) => schWrite(SCHED.map(m => m.id !== mid ? m : { ...m, subs: m.subs.map(s => s.id !== sid ? s : { ...s, ...patch }) }));
    const isAdmin = S.role === 'Owner / Admin';
    const isPM = S.role === 'Project Manager' || isAdmin;
    // pending approval queue across all projects
    const extQueue = [];
    SCHED.forEach(m => m.subs.forEach(s => (s.exts||[]).forEach(e => extQueue.push({ ...e, mid:m.id, sid:s.id, main:m.name, act:s.name, pm:m.pm, proj:schKeyOf(m), ps:s.ps, pe:s.pe, cur:revEnd(s) }))));
    const extPending = extQueue.filter(e => e.pmStatus === 'Pending' || (e.pmStatus === 'Approved' && e.admStatus === 'Pending'));
    // reports
    const allSubs = [];
    SCHED.forEach(m => m.subs.forEach(s => allSubs.push({ ...s, main:m.name, pm:m.pm, proj:schKeyOf(m), M:sMetrics(s) })));
    const pmPerf = [...new Set(SCHED.map(m => m.pm))].map(pm => {
      const rows = allSubs.filter(s => s.pm === pm);
      const started = rows.filter(s => s.as), fin = rows.filter(s => s.status === 'Completed');
      const onS = started.filter(s => s.M.onStart).length, onD = fin.filter(s => s.M.onDone).length;
      const exts = rows.reduce((a,s) => a.concat(s.exts||[]), []);
      const gen = exts.filter(e => e.verdict === 'Genuine').length;
      const avo = exts.filter(e => e.verdict === 'Avoidable').length;
      const base = (started.length + fin.length) ? Math.round(((onS + onD) / (started.length + fin.length)) * 100) : 0;
      const score = Math.max(0, base - avo * 10);
      return { pm, rows, activities: rows.length, started: started.length, fin: fin.length, onS, onD, gen, avo, base, score,
        onSPct: started.length ? Math.round(onS/started.length*100) : 0, onDPct: fin.length ? Math.round(onD/fin.length*100) : 0 };
    });
    // dashboard alerts
    const schAlerts = { start: allSubs.filter(s => s.M.startToday || (s.M.startDue && s.status === 'Not started')),
      due: allSubs.filter(s => s.M.dueToday), over: allSubs.filter(s => s.M.overdue) };
    let CCODES;
    const fuFmt = (d) => { const p=(d||'').split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : (d||''); };
    const nextFU = (l) => { const arr=(l.followups||[]).filter(f=>f.date); if(!arr.length) return null;
      const rank = (f) => fuState(f)==='over' ? 0 : fuState(f)==='today' ? 1 : 2;
      return arr.slice().sort((a,b)=> rank(a)-rank(b) || (a.date+a.time).localeCompare(b.date+b.time))[0]; };
    const fuState = (f) => f.date < TODAY ? 'over' : f.date === TODAY ? 'today' : 'up';
    const FUC = {
      over:  { label:'OVERDUE',  fg:'#B23334', bg:'#FCEDED', bd:'#F2CBCB' },
      today: { label:'TODAY',    fg:'#B4530A', bg:'#FDF3E7', bd:'#F3DDBB' },
      up:    { label:'UPCOMING', fg:'#0672A6', bg:'#E3F2FC', bd:'#BFE0F2' }
    };
    const FTYPES = ['text','phone','number','date','dropdown','description','checkbox'];
    const TLABEL = { text:'Text', phone:'Phone number', number:'Number', date:'Date', dropdown:'Dropdown', description:'Long description', checkbox:'Checkbox' };
    const srcOf = (s) => srcC[s] || ['#4A5077','#EEF1F9'];
    const passes = (l) => {
      const q = S.lfSearch.trim().toLowerCase();
      if (q && !((l.name+' '+(l.mobile||'')+' '+l.want+' '+l.src).toLowerCase().includes(q))) return false;
      if (S.lfStage !== 'All') { const stg = S.leadStages.find(s=>s.name===S.lfStage); if (!stg || l.stage !== stg.id) return false; }
      if (S.lfSource !== 'All' && l.src !== S.lfSource) return false;
      if (S.lfFU !== 'All') { const f = nextFU(l);
        if (S.lfFU === 'None') { if (f) return false; }
        else { if (!f || FUC[fuState(f)].label !== S.lfFU.toUpperCase()) return false; } }
      return true;
    };
    const pager = (total, page, per, setPage) => {
      const pages = Math.max(1, Math.ceil(total/per)), cur = Math.min(page, pages);
      const from = total===0 ? 0 : (cur-1)*per + 1, to = Math.min(cur*per, total);
      return { label: from + '–' + to + ' of ' + total, pageLabel: 'Page ' + cur + ' of ' + pages,
        show: total > per, atStart: cur<=1, atEnd: cur>=pages,
        prev: () => setPage(Math.max(1, cur-1)), next: () => setPage(Math.min(pages, cur+1)),
        prevStyle: { border:'1px solid #E3E7F2', background: cur<=1?'#F7F9FD':'#fff', color: cur<=1?'#C0C5DC':'#0672A6', font:"700 12px 'Public Sans',sans-serif", borderRadius:'8px', padding:'7px 13px', cursor: cur<=1?'not-allowed':'pointer' },
        nextStyle: { border:'1px solid #E3E7F2', background: cur>=pages?'#F7F9FD':'#fff', color: cur>=pages?'#C0C5DC':'#0672A6', font:"700 12px 'Public Sans',sans-serif", borderRadius:'8px', padding:'7px 13px', cursor: cur>=pages?'not-allowed':'pointer' },
        slice: (arr) => arr.slice((cur-1)*per, cur*per) };
    };
    const pipeline = S.leadStages.map(st => {
      const stCards = S.leads.filter(l => l.stage === st.id && passes(l));
      const stPage = pager(stCards.length, 1, 6, ()=>{});
      const cards = stCards.slice(0,6).map(l => ({
        name:l.name, src:l.src, want:l.want, mobile: l.mobile || '—',
        srcStyle:{...this.pill(srcOf(l.src)[0], srcOf(l.src)[1]),fontSize:'9px',letterSpacing:'.04em'},
        lost: st.id==='lost' && !!l.lostReason, lostReason: l.lostReason || '',
        ...(() => { const f = nextFU(l); if (!f) return { hasFU:false, noFU:true, fuType:'', fuWhen:'', fuBadge:'', fuStyle:{}, fuIcon:'', fuBadgeStyle:{} };
          const k = fuState(f), c = FUC[k];
          return { hasFU:true, noFU:false, fuIcon: f.type==='Call' ? '📞' : '🏠',
            fuType: f.type==='Call' ? 'CALL' : 'SITE VISIT', fuWhen: fuFmt(f.date) + ' · ' + f.time, fuBadge: c.label,
            fuStyle: { marginTop:'8px', display:'flex', flexDirection:'column', gap:'4px', background:c.bg, border:'1px solid '+c.bd, borderLeft:'3px solid '+c.fg, borderRadius:'8px', padding:'7px 9px' },
            fuTypeStyle: { font:"800 10px 'Public Sans',sans-serif", letterSpacing:'.06em', color:c.fg, whiteSpace:'nowrap' },
            fuWhenStyle: { font:"600 10.5px 'Public Sans',sans-serif", color:c.fg, opacity:.85, whiteSpace:'nowrap' },
            fuBadgeStyle: { font:"800 8.5px 'Public Sans',sans-serif", color:'#fff', background:c.fg, borderRadius:'99px', padding:'3px 7px', letterSpacing:'.06em', flexShrink:0 } }; })(),
        open: () => this.setState({ selLead: l.id, leadTab: 'timeline' }),
        dragStart: (e) => { try { e.dataTransfer.setData('text/plain', String(l.id)); e.dataTransfer.effectAllowed = 'move'; } catch(_) {} this.setState({ dragId: l.id }); }
      }));
      return { stage: st.name, count: stCards.length, cards,
        more: stCards.length > 6, moreTxt: '+ ' + (stCards.length - 6) + ' more · switch to List view',
        countStyle: this.pill('#fff', st.id==='booked'?'#1F9D66':st.id==='lost'?'#B23334':'#191A5C'),
        dragOver: (e) => e.preventDefault(),
        drop: (e) => { e.preventDefault(); const id = this.state.dragId; if (id == null) return;
          const lead = this.state.leads.find(x => x.id === id);
          if (!lead || lead.stage === st.id) { this.setState({ dragId: null }); return; }
          if (st.id === 'lost') { this.setState({ lostFlow: id, lostReason:'', lostRemarks:'', dragId: null }); }
          else { const fromName = (this.state.leadStages.find(s=>s.id===lead.stage)||{}).name || '';
            this.setState({ leads: this.state.leads.map(x => x.id===id ? { ...x, stage: st.id, lostReason: undefined, history:[{t:'stage', txt:'Stage moved '+fromName+' → '+st.name, at: now(), by:this.state.role, from:fromName, to:st.name}, ...histOf(x)] } : x), dragId: null });
            this.toast(lead.name + ' moved to ' + st.name); } }
      };
    });
    CCODES = ['+91 India','+971 UAE','+966 Saudi Arabia','+974 Qatar','+965 Kuwait','+973 Bahrain','+968 Oman','+65 Singapore','+60 Malaysia','+1 USA / Canada','+44 UK','+61 Australia','+64 New Zealand','+49 Germany','+33 France','+81 Japan','+86 China','+94 Sri Lanka','+977 Nepal','+880 Bangladesh'];
    const leadFormFields = S.leadFields.map(f => ({
      label: f.label, req: f.req,
      isPhone: f.type==='phone',
      ccOpts: CCODES.map(c=>({c})),
      ccChange: f.label==='Mobile number' ? (e)=>setS({leadCC: e.target.value.split(' ')[0]}) : undefined,
      isInput: ['text','number','date'].includes(f.type) || f.type==='text',
      isDrop: f.type==='dropdown', isDesc: f.type==='description', isCheck: f.type==='checkbox',
      options: [{o:'Select…'}].concat((f.options||'').split(',').map(s=>s.trim()).filter(Boolean).map(o=>({o}))),
      ph: f.type==='phone' ? '98765 43210 (without country code)' : f.type==='number' ? 'e.g. 85,00,000' : f.type==='date' ? 'dd-mm-yyyy' : 'Type here',
      val: f.label==='Name' ? S.leadName : f.label==='Mobile number' ? S.leadMobile : undefined,
      change: f.label==='Name' ? (e)=>setS({leadName:e.target.value}) : f.label==='Mobile number' ? (e)=>setS({leadMobile:e.target.value.replace(/[^\d\s]/g,'')}) : undefined,
      selChange: f.label==='Source' ? (e)=>setS({leadSource: e.target.value==='Select…' ? '' : e.target.value}) : undefined
    }));
    const lostLeadObj = S.leads.find(l => l.id === S.lostFlow);
    // FLATS
    const UST = {
      A:{ label:'Available', fg:'#177049', bg:'#E4F6EC', bd:'#77C39A' },
      H:{ label:'Held', fg:'#8A5A12', bg:'#FDF3E7', bd:'#E0B26A' },
      B:{ label:'Booked', fg:'#0672A6', bg:'#E3F2FC', bd:'#6FB6DE' }
    };
    const PROJ_TOWERS = [['A','B','C'],['A','B'],['C1','C2','C3']];
    const bTowers = PROJ_TOWERS[S.boardProj] || PROJ_TOWERS[0];
    const bTower = bTowers.includes(S.tower) ? S.tower : bTowers[0];
    const towerIdx = bTowers.indexOf(bTower);
    const fchip = (on) => ({ border:'1px solid '+(on?'#0089C9':'#E3E7F2'), background:on?'#E3F2FC':'#fff', color:on?'#0672A6':'#7A80A3', font:"600 11px 'Public Sans',sans-serif", borderRadius:'99px', padding:'6px 11px', cursor:'pointer' });
    const seq = ['A','A','B','A','H','A','B','B','A','A','B','B','A','H','A','A','B','A','B','A','A','A','B','A'];
    const HOLDERS = ['Kiran & Shwetha','Naveen G.','Priya N.','Srinivas K.','Farida Khan','Vikram T.','Deepa & Arjun','Mohammed R.'];
    const holderOf = (no, st) => {
      const ov = S.resv[no];
      if (ov) return ov.who;
      if (st==='A') return null;
      let h=0; for (const ch of no) h += ch.charCodeAt(0);
      return HOLDERS[h % HOLDERS.length];
    };
    const plans = ['2 BHK','2 BHK','3 BHK','3 BHK'];
    const floors = [];
    for (let f = 12; f >= 1; f--) {
      const units = [];
      for (let u = 1; u <= 4; u++) {
        const no = bTower + '-' + f + '0' + u;
        const st = S.resv[no] ? S.resv[no].st : seq[(f*3 + u*5 + towerIdx*7) % 24];
        const c = UST[st];
        const dim = !((S.flStatus==='All' || ({Available:'A',Held:'H',Booked:'B'})[S.flStatus]===st) && (S.flCfg==='All' || plans[u-1]===S.flCfg));
        units.push({ no, plan: plans[u-1], pick: () => setS({ selUnit: { no, st, floor: f, plan: plans[u-1] } }),
          style: { display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', padding:'8px 4px', borderRadius:'9px', border:'1px solid '+c.bd, background:c.bg, color:c.fg, cursor:'pointer', opacity: dim ? .18 : 1, pointerEvents: dim ? 'none' : 'auto', outline: S.selUnit && S.selUnit.no===no ? '2px solid #0089C9' : 'none', transition:'transform .15s ease, box-shadow .15s ease' } });
      }
      floors.push({ label:'Fl '+f, units });
    }
    let counts = { A:0,H:0,B:0 };
    floors.forEach(fl => fl.units.forEach((u,ui) => { const st = S.resv[u.no] ? S.resv[u.no].st : seq[(parseInt(fl.label.slice(3))*3 + (ui+1)*5 + towerIdx*7) % 24]; counts[st]++; }));
    const tcs = (v,l,fg,bg,bd)=>({ value:String(v), label:l, style:{ background:bg, border:'1px solid '+bd, borderRadius:'10px', padding:'11px 13px', color:fg } });
    const towerStats = [
      tcs(counts.A,'Available','#177049','#E4F6EC','#C4E8D4'), tcs(counts.H,'On hold','#8A5A12','#FDF3E7','#F3DDBB'),
      tcs(counts.B,'Booked','#0672A6','#E3F2FC','#BFE0F2')
    ];
    const twPrefix = PDATA[S.boardProj].type === 'Villa' ? 'Cluster ' : 'Tower ';
    const towers = bTowers.map(t => ({ label:twPrefix+t, pick:()=>setS({tower:t, selUnit:null}),
      style:{ border:'1px solid '+(bTower===t?'#0089C9':'#E3E7F2'), background:bTower===t?'#E3F2FC':'#fff', color:bTower===t?'#0672A6':'#5A6080', font:"700 12px 'Public Sans',sans-serif", borderRadius:'99px', padding:'9px 16px', cursor:'pointer' } }));
    // Unit setup (create floors/flats under a project)
    const fsProjects = PDATA.filter(p => p.type !== 'Commercial').map((p, i) => ({
      label: p.name, pick: () => setS({ fsProject: i }),
      style: { border:'1px solid '+(S.fsProject===i?'#0089C9':'#E3E7F2'), background:S.fsProject===i?'#E3F2FC':'#fff', color:S.fsProject===i?'#0672A6':'#5A6080', font:"600 12px 'Public Sans',sans-serif", borderRadius:'99px', padding:'8px 14px', cursor:'pointer' }
    }));
    const ALL_TYPES = ['1 RK','1 BHK','2 BHK','3 BHK','4 BHK','5 BHK'];
    const CFG = {
      '1 RK':  { fg:'#4A5077', bg:'#EEF1F9', bd:'#C9CFE2', short:'1 RK' },
      '1 BHK': { fg:'#0672A6', bg:'#E3F2FC', bd:'#9CCDE9', short:'1 BHK' },
      '2 BHK': { fg:'#177049', bg:'#E4F6EC', bd:'#9AD4B4', short:'2 BHK' },
      '3 BHK': { fg:'#5636A8', bg:'#EFE9FC', bd:'#C3B2EC', short:'3 BHK' },
      '4 BHK': { fg:'#8A5A12', bg:'#FDF3E7', bd:'#E8C88F', short:'4 BHK' },
      '5 BHK': { fg:'#FFFFFF', bg:'#191A5C', bd:'#191A5C', short:'5 BHK' }
    };
    const tplOf = (p) => S.fsTpl[p] || (p <= 2 ? '2 BHK' : '3 BHK');
    const cfgOf = (f,p) => S.fsOver[f+'-'+p] || tplOf(p);
    const stepBtn = { width:'30px', height:'30px', border:'1px solid #E3E7F2', background:'#fff', borderRadius:'8px', cursor:'pointer', font:"700 15px 'Public Sans',sans-serif", color:'#0672A6', display:'flex', alignItems:'center', justifyContent:'center' };
    const fsBrushChips = ALL_TYPES.map(t => ({ label:t, pick: () => setS({ fsBrush: t }),
      style: { display:'flex', alignItems:'center', gap:'7px', border:'2px solid '+(S.fsBrush===t?'#0089C9':'#E3E7F2'), background:'#fff', borderRadius:'10px', padding:'8px 12px', cursor:'pointer', font:`${S.fsBrush===t?'700':'600'} 12px 'Public Sans',sans-serif`, color:'#22264A', boxShadow:S.fsBrush===t?'0 0 0 3px #E3F2FC':'none' },
      dotStyle: { width:'14px', height:'14px', borderRadius:'4px', background:CFG[t].bg, border:'1.5px solid '+CFG[t].bd, display:'inline-block' } }));
    const fsTplCells = Array.from({length:S.fsPer},(_,i)=>{ const p=i+1, cfg=tplOf(p);
      const next = ALL_TYPES[(ALL_TYPES.indexOf(cfg)+1) % ALL_TYPES.length];
      return { no:'0'+p, cfg, pick: () => setS({ fsTpl: { ...S.fsTpl, [p]: next }, fsOver: Object.fromEntries(Object.entries(S.fsOver).filter(([k])=>!k.endsWith('-'+p))) }),
        style: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', padding:'14px 6px', borderRadius:'11px', border:'1.5px solid '+CFG[cfg].bd, background:CFG[cfg].bg, color:CFG[cfg].fg, cursor:'pointer', transition:'transform .12s ease' } }; });
    const numOf = (f,p) => S.fsNums[f+'-'+p] || String(f) + '0' + p;
    const perOf = (f) => S.fsFloorCounts[f] != null ? S.fsFloorCounts[f] : S.fsPer;
    const fsPreview = [];
    for (let f=S.fsFloors; f>=1; f--) fsPreview.push({ label:'Fl '+f, count: perOf(f),
      minus: (() => { const ff=f; return () => setS({ fsFloorCounts: { ...S.fsFloorCounts, [ff]: Math.max(1, perOf(ff)-1) }, fsEdit: null }); })(),
      plus: (() => { const ff=f; return () => setS({ fsFloorCounts: { ...S.fsFloorCounts, [ff]: Math.min(8, perOf(ff)+1) }, fsEdit: null }); })(),
      cells: Array.from({length:perOf(f)},(_,i)=>{ const p=i+1, cfg=cfgOf(f,p), over=!!S.fsOver[f+'-'+p]||!!S.fsNums[f+'-'+p];
        const editing = S.fsEdit && S.fsEdit.f===f && S.fsEdit.p===p;
        return { no: numOf(f,p), short: CFG[cfg].short, pick: () => setS({ fsEdit: { f, p } }),
          style: { flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'5px', padding:'8px 4px', borderRadius:'8px', border:(over||editing?'2px':'1px')+' solid '+(editing?'#0089C9':CFG[cfg].bd), background:CFG[cfg].bg, color:CFG[cfg].fg, cursor:'pointer', font:"700 10.5px 'Public Sans',sans-serif", boxShadow:editing?'0 0 0 3px #E3F2FC':'none' } }; }) });
    // Flat editor
    let fsEditor = null;
    if (S.fsEdit) {
      const { f, p } = S.fsEdit, key = f+'-'+p, cur = cfgOf(f,p);
      fsEditor = {
        title: 'Floor ' + f + ' · position 0' + p,
        num: numOf(f,p),
        numChange: (e) => setS({ fsNums: { ...S.fsNums, [key]: e.target.value } }),
        cfgChips: ALL_TYPES.map(t => ({ label:t, pick: () => setS({ fsOver: { ...S.fsOver, [key]: t } }),
          style: { display:'flex', alignItems:'center', gap:'7px', border:'2px solid '+(cur===t?'#0089C9':'#E3E7F2'), background:cur===t?'#E3F2FC':'#fff', borderRadius:'10px', padding:'8px 12px', cursor:'pointer', font:`${cur===t?'700':'600'} 12px 'Public Sans',sans-serif`, color:'#22264A' },
          dotStyle: { width:'13px', height:'13px', borderRadius:'4px', background:CFG[t].bg, border:'1.5px solid '+CFG[t].bd, display:'inline-block' } })),
        applyFloor: () => {
          const add = {}; for (let i=1; i<=perOf(f); i++) add[f+'-'+i] = cur;
          setS({ fsOver: { ...S.fsOver, ...add } });
          this.toast(cur + ' applied to all of floor ' + f);
        },
        close: () => setS({ fsEdit: null })
      };
    }
    const cfgCounts = {};
    let fsTotalCount = 0;
    for (let f=1; f<=S.fsFloors; f++) for (let p=1; p<=perOf(f); p++) { const c=cfgOf(f,p); cfgCounts[c]=(cfgCounts[c]||0)+1; fsTotalCount++; }
    const fsSummary = ALL_TYPES.filter(t=>cfgCounts[t]).map(t => ({ cfg:t, count:cfgCounts[t],
      dotStyle: { width:'12px', height:'12px', borderRadius:'4px', background:CFG[t].bg, border:'1.5px solid '+CFG[t].bd, display:'inline-block' } }));
    const fsTotal = fsTotalCount;
    // Hold / booking flow
    const CUSTOMERS = [
      { name:'Rahul Menon', sub:'Website lead · ₹78 L budget' },
      { name:'Farida Khan', sub:'MagicBricks · ₹92 L budget' },
      { name:'Vikram T.', sub:'99acres · ₹1.1 Cr budget' },
      { name:'Ananya S.', sub:'Referral · villa enquiry' },
      { name:'Srinivas K.', sub:'Negotiation · B-704' }
    ];
    const resCustomers = CUSTOMERS.map((c,i) => ({ ...c, pick: () => setS({ resCust: i, custNew: false }),
      style: { display:'flex', flexDirection:'column', gap:'2px', alignItems:'flex-start', width:'100%', textAlign:'left', border:'1px solid '+(S.resCust===i?'#0089C9':'#E3E7F2'), background:S.resCust===i?'#E3F2FC':'#fff', borderRadius:'10px', padding:'9px 12px', cursor:'pointer', font:"700 12.5px 'Public Sans',sans-serif", color:'#22264A' } }));
    let su = null;
    if (S.selUnit) {
      const area = S.selUnit.plan==='3 BHK' ? 1420 : 1180;
      const rate = 6450 + S.selUnit.floor * 25;
      const base = area * rate, rise = area * S.selUnit.floor * 25, plc = S.selUnit.no.endsWith('1')||S.selUnit.no.endsWith('4') ? 145000 : 0;
      const park = 350000, amen = 275000;
      const sub = base + plc + park + amen;
      const gst = Math.round(sub * .05), reg = Math.round(sub * .066);
      const L = (n) => '₹' + (n/100000).toFixed(2) + ' L';
      su = { no:S.selUnit.no, plan:S.selUnit.plan, area:String(area), statusLabel:UST[S.selUnit.st].label.split(' ·')[0],
        stStyle: this.pill('#191A5C','#5BC8F2'),
        lines: [ {k:'Base price · ₹'+rate+'/sq ft', v:L(base)}, {k:'Floor rise', v:'included'}, {k:'PLC (corner/park-facing)', v: plc?L(plc):'—'}, {k:'Covered parking', v:L(park)}, {k:'Amenities & clubhouse', v:L(amen)}, {k:'GST @ 5%', v:L(gst)}, {k:'Registration & stamp duty', v:L(reg)} ],
        total: '₹' + ((sub+gst+reg)/10000000).toFixed(2) + ' Cr',
        canReserve: S.selUnit.st === 'A' || S.selUnit.st === 'H',
        holder: holderOf(S.selUnit.no, S.selUnit.st),
        holderLabel: S.selUnit.st==='H' ? 'Held for' : 'Booked for',
        releaseLabel: S.selUnit.st==='H' ? 'Release hold' : 'Remove booking',
        canRelease: S.selUnit.st === 'H' || S.selUnit.st === 'B',
        release: () => {
          setS({ resv: { ...S.resv, [S.selUnit.no]: { st:'A', who:null } }, selUnit: { ...S.selUnit, st:'A' } });
          this.toast('Unit ' + S.selUnit.no + ' released — now showing as Available');
        },
        hold: () => setS({ resFlow: 'hold', resCust: null, custNew: false }),
        book: () => setS({ resFlow: 'book', resCust: null, custNew: false }) };
    }
    const resConfirm = () => {
      const who = S.custNew ? 'New customer' : (S.resCust != null ? CUSTOMERS[S.resCust].name : null);
      if (!who) { this.toast('Select or create a customer first'); return; }
      const st = S.resFlow === 'hold' ? 'H' : 'B';
      setS({ resv: { ...S.resv, [S.selUnit.no]: { st, who } }, resFlow: null, selUnit: { ...S.selUnit, st } });
      this.toast('Unit ' + S.selUnit.no + (S.resFlow==='hold' ? ' held for ' + who : ' booked for ' + who + ' — token receipt & KYC next'));
    };
    // FOLLOW-UPS SCREEN
    const allFU = [];
    S.leads.forEach(l => (l.followups||[]).forEach(f => { if (f.date) allFU.push({ ...f, lead:l }); }));
    const fuPass = (x) => {
      const q = S.fuSearch.trim().toLowerCase();
      if (q && !((x.lead.name+' '+(x.remarks||'')+' '+x.type+' '+(x.lead.want||'')).toLowerCase().includes(q))) return false;
      if (S.fuFType !== 'All types' && x.type !== S.fuFType) return false;
      return true;
    };
    const fuList = allFU.filter(fuPass).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    const dayDiff = (d) => Math.round((new Date(d+'T00:00:00') - new Date(TODAY+'T00:00:00'))/86400000);
    const bucketOf = (d) => { const n = dayDiff(d); return n<0?'Overdue':n===0?'Today':n===1?'Tomorrow':n<=7?'This Week':'Later'; };
    const BKC = { Overdue:'#B23334', Today:'#B4530A', Tomorrow:'#0672A6', 'This Week':'#5636A8', Later:'#4A5077' };
    const fuCard = (x) => { const c = FUC[fuState(x)]; const isCall = x.type==='Call';
      return { type: isCall ? 'CALL' : 'SITE VISIT', icon: isCall ? '📞' : '🏠',
        name:x.lead.name, mobile: x.lead.mobile || '—', remarks:x.remarks || '—', when: fuFmt(x.date)+', '+x.time, want:x.lead.want,
        typeStyle: { display:'inline-flex', alignItems:'center', gap:'6px', font:"800 9.5px 'Public Sans',sans-serif", letterSpacing:'.09em', color:'#fff', background: isCall?'#0672A6':'#5636A8', borderRadius:'99px', padding:'5px 11px' },
        whenStyle: { font:"700 12px 'Public Sans',sans-serif", color:c.fg, marginTop:'7px" ' },
        whenColor: { font:"700 12px 'Public Sans',sans-serif", color:c.fg },
        badge: c.label, badgeStyle: { font:"800 8.5px 'Public Sans',sans-serif", color:'#fff', background:c.fg, borderRadius:'99px', padding:'3px 7px', letterSpacing:'.06em' },
        open: () => this.setState({ screen:'leads', selLead:x.lead.id, leadTab:'fus' }) }; };
    const fuBuckets = ['Overdue','Today','Tomorrow','This Week','Later'].map(b => {
      const items = fuList.filter(x => bucketOf(x.date) === b);
      return { name:b, count: items.length + (items.length===1?' follow-up':' follow-ups'), empty: items.length===0, cards: items.slice(0,6).map(fuCard),
        more: items.length > 6, moreTxt: '+ ' + (items.length-6) + ' more · switch to List view',
        headStyle: { font:"800 15px 'Sora',sans-serif", color: BKC[b] } };
    });
    const leadPg = pager(S.leads.filter(passes).length, S.leadPage, S.leadPer, (p)=>this.setState({leadPage:p}));
    const fuPg = pager(fuList.length, S.fuPage, S.fuPer, (p)=>this.setState({fuPage:p}));
    const fuRows = fuPg.slice(fuList).map(x => { const c = FUC[fuState(x)];
      return { ...fuCard(x), bucket: bucketOf(x.date), bucketStyle: {...this.pill(BKC[bucketOf(x.date)], '#F7F9FD'), fontSize:'10px'} }; });
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const calY = 2026, calM = S.fuMonth;
    const firstDow = new Date(calY, calM, 1).getDay(), dim = new Date(calY, calM+1, 0).getDate();
    const calCells = [];
    for (let i=0;i<firstDow;i++) calCells.push({ blank:true, day:'', items:[], style:{ minHeight:'88px', borderRadius:'9px', background:'#FAFBFE', border:'1px solid #F2F5FB' }, dayStyle:{} });
    for (let d=1;d<=dim;d++) {
      const iso = calY+'-'+String(calM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      const items = fuList.filter(x => x.date === iso).map(x => { const c = FUC[fuState(x)];
        return { txt: (x.type==='Call'?'📞 ':'🏠 ') + x.time + ' · ' + x.lead.name,
          tip: (x.type==='Call'?'📞 CALL':'🏠 SITE VISIT') + '\n' + x.lead.name + ' · ' + (x.lead.mobile||'—') + '\n' + (x.lead.want||'') + '\n' + fuFmt(x.date) + ', ' + x.time + ' · ' + FUC[fuState(x)].label + '\nRemarks: ' + (x.remarks || '—'),
          typeLabel: x.type==='Call' ? '📞 CALL' : '🏠 SITE VISIT', name:x.lead.name, mobile:x.lead.mobile||'—', want:x.lead.want||'', remarks:x.remarks||'—',
          when: fuFmt(x.date)+', '+x.time, badge: FUC[fuState(x)].label,
          typeChip: { display:'inline-flex', alignItems:'center', gap:'5px', font:"800 8.5px 'Public Sans',sans-serif", letterSpacing:'.08em', color:'#fff', background: x.type==='Call'?'#0672A6':'#5636A8', borderRadius:'99px', padding:'3px 8px' },
          badgeChip: { font:"800 8.5px 'Public Sans',sans-serif", color:'#fff', background:c.fg, borderRadius:'99px', padding:'3px 8px', letterSpacing:'.06em' },
          whenStyle: { font:"700 11.5px 'Public Sans',sans-serif", color:c.fg, marginTop:'7px' },
          style: { position:'relative', background:c.bg, border:'1px solid '+c.bd, borderRadius:'6px', padding:'3px 5px', marginTop:'3px', cursor:'pointer' },
          txtStyle: { display:'block', font:"600 9.5px 'Public Sans',sans-serif", color:c.fg, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
          open: () => this.setState({ screen:'leads', selLead:x.lead.id, leadTab:'fus' }) }; });
      const isToday = iso === TODAY;
      calCells.push({ blank:false, day:String(d), items,
        style: { minHeight:'88px', borderRadius:'9px', background: isToday?'#EFF3FB':'#fff', border:'1px solid '+(isToday?'#0089C9':'#E9EDF6'), padding:'6px 7px' },
        dayStyle: { font:`${isToday?'800':'600'} 11px 'Public Sans',sans-serif`, color: isToday?'#0672A6':'#9BA1C2' } });
    }
    // HR — USERS & ATTENDANCE
    const fIcon = (n) => { const e = n.split('.').pop().toLowerCase();
      return e==='pdf' ? ['#B23334','#FCEDED','PDF'] : (e==='xlsx'||e==='csv') ? ['#177049','#E4F6EC','XLS'] : (e==='docx'||e==='doc') ? ['#0672A6','#E3F2FC','DOC'] : (e==='zip') ? ['#8A5A12','#FDF3E7','ZIP'] : ['#4A5077','#EEF1F9','FILE']; };
    const mkFile = (f) => { const ic = fIcon(f.n); const ext = f.n.split('.').pop().toLowerCase();
      const viewable = ['pdf','png','jpg','jpeg','webp'].includes(ext);
      return { n:f.n, s:f.s, tag:ic[2], canView: viewable,
        view: () => this.toast('Opening ' + f.n + ' in the document viewer'),
        tagStyle: { font:"800 8.5px 'Public Sans',sans-serif", color:'#fff', background:ic[0], borderRadius:'5px', padding:'4px 6px', letterSpacing:'.05em', flexShrink:0 } }; };
    const ETC = { 'Company Staff':['#2F308C','#EFF3FB'], 'Contract Role':['#5636A8','#EFE9FC'], 'Direct Labour':['#177049','#E4F6EC'] };
    const etOf = (t) => ETC[t] || ['#4A5077','#EEF1F9'];
    const avatarStyle = (i) => ({ width:'46px', height:'46px', borderRadius:'11px', background:['#0089C9','#2F308C','#1F9D66','#E8A13A'][i%4], color:'#fff', font:"700 15px 'Public Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 });
    const initOf = (n) => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const empRows = S.employees.map((e,i) => ({
      name:e.name, type:e.type, mobile:e.mobile, aadhaar:e.aadhaar, pan:e.pan, addr:e.addr, alt:e.alt, skill:e.skill, desig:e.desig||'—',
      init: initOf(e.name), avStyle: avatarStyle(i), typeStyle: this.pill(etOf(e.type)[0], etOf(e.type)[1]),
      view: () => setS({ empView: e.id }),
      edit: () => setS({ empForm:'edit', empId:e.id, eType:e.type, eName:e.name, eMobile:e.mobile.replace(/^\+\d+\s/,''), eCC:(e.mobile.match(/^\+\d+/)||['+91'])[0], eAadhaar:e.aadhaar, ePan:e.pan==='—'?'':e.pan, eAddr:e.addr, eAlt:e.alt==='—'?'':e.alt, eDesig:e.desig||'', eDocs:e.docs||[], ePhoto:true }),
      del: () => { setS({ employees: S.employees.filter(x=>x.id!==e.id) }); this.toast(e.name + ' removed from the user master'); }
    }));
    const ATS = { P:['Present','#177049','#E4F6EC','#9AD4B4'], A:['Absent','#B23334','#FCEDED','#F2CBCB'], H:['Half day','#B4530A','#FDF3E7','#F3DDBB'] };
    const evObj = S.employees.find(e => e.id === S.empView);
    const evIdx = S.employees.findIndex(e => e.id === S.empView);
    let empDetail = { name:'', type:'', desig:'', init:'', avStyle:{}, typeStyle:{}, fields:[], docs:[], docsEmpty:true, docsCount:'', att:[], attEmpty:true, cells:[], rangeLabel:'', marked:'', p:'0', h:'0', a:'0', ot:'—', pay:'0', exportOne:()=>{}, edit:()=>{}, del:()=>{} };
    if (evObj) {
      const evDates = []; { let d = new Date(S.evFrom+'T00:00:00'), end = new Date(S.evTo+'T00:00:00');
        while (d <= end && evDates.length < 93) { evDates.push(isoLocal(d)); d.setDate(d.getDate()+1); } }
      const recent = []; let p=0,h=0,a=0,ot=0;
      evDates.slice().reverse().forEach(d => { const r = S.att[d+'|'+evObj.id]; if (!r || !r.st) return; const m = ATS[r.st];
        recent.push({ date: fuFmt(d), st:m[0], ot: r.ot ? r.ot+' h' : '—', work: r.work || '—', stStyle: this.pill(m[1], m[2]) });
        if (r.st==='P') p++; else if (r.st==='H') h++; else a++; ot += parseFloat(r.ot||0)||0; });
      empDetail = { name:evObj.name, type:evObj.type, desig:evObj.desig||'—', init:initOf(evObj.name), avStyle:{ ...avatarStyle(evIdx), width:'150px', height:'150px', borderRadius:'18px', font:"700 46px 'Sora',sans-serif" },
        typeStyle: this.pill(etOf(evObj.type)[0], etOf(evObj.type)[1]),
        docs: (evObj.docs || []).map(d => ({ ...mkFile(d), kind: d.kind || 'Document' })), docsEmpty: (evObj.docs||[]).length===0,
        docsCount: (evObj.docs||[]).length + ((evObj.docs||[]).length===1?' document':' documents'),
        fields: [ {k:'Type of employment',v:evObj.type}, {k:'Mobile number',v:evObj.mobile}, {k:'Alternate number',v:evObj.alt},
          {k:'Designation',v:evObj.desig||'—'}, {k:'Aadhaar number',v:evObj.aadhaar}, {k:'PAN',v:evObj.pan}, {k:'Address',v:evObj.addr} ],
        att: recent, attEmpty: recent.length===0,
        rangeLabel: evDates.length + (evDates.length===1?' day':' days') + ' · ' + fuFmt(S.evFrom) + ' → ' + fuFmt(S.evTo),
        marked: recent.length + ' of ' + evDates.length + ' days marked',
        exportOne: () => this.toast('Exported ' + evObj.name + '\u2019s attendance — ' + S.evFrom + ' to ' + S.evTo),
        cells: evDates.map(d => { const r = S.att[d+'|'+evObj.id]; const m = r && r.st ? ATS[r.st] : null;
          const dd = d.slice(8);
          return { day: dd, label: m ? m[0][0] : '·',
            tip: fuFmt(d) + (m ? ' · ' + m[0] + (r.ot ? ' · OT ' + r.ot + ' h' : '') + (r.work ? '\n' + r.work : '') : ' · not marked'),
            style: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', minHeight:'44px', borderRadius:'8px',
              background: m ? m[2] : '#FAFBFE', border:'1px solid '+(m ? m[3] : '#EEF1F8'), color: m ? m[1] : '#C0C5DC',
              font:"700 11px 'Public Sans',sans-serif", cursor:'default' } }; }),
        p:String(p), h:String(h), a:String(a), ot: ot ? ot.toFixed(1)+' h' : '—', pay:(p+h*0.5).toFixed(1),
        edit: () => setS({ empForm:'edit', empId:evObj.id, eType:evObj.type, eName:evObj.name, eMobile:evObj.mobile.replace(/^\+\d+\s/,''), eCC:(evObj.mobile.match(/^\+\d+/)||['+91'])[0], eAadhaar:evObj.aadhaar, ePan:evObj.pan==='—'?'':evObj.pan, eAddr:evObj.addr, eAlt:evObj.alt==='—'?'':evObj.alt, eDesig:evObj.desig||'', eDocs:evObj.docs||[], ePhoto:true }),
        del: () => { setS({ employees:S.employees.filter(x=>x.id!==evObj.id), empView:null }); this.toast(evObj.name + ' removed'); } };
    }
    const attKey = (id) => S.attDate + '|' + id;
    const attRows = S.employees.map((e,i) => { const r = S.att[attKey(e.id)] || {};
      return { name:e.name, skill:e.desig||e.skill, type:e.type, init:initOf(e.name), avStyle:avatarStyle(i),
        typeStyle: this.pill(etOf(e.type)[0], etOf(e.type)[1]),
        marks: ['P','A','H'].map(k => { const on = r.st===k; const m = ATS[k];
          return { label:m[0], pick: () => setS({ att: { ...S.att, [attKey(e.id)]: { ...r, st:k, ot: k==='A' ? '' : (r.ot||'') } } }),
            style: { border:'1.5px solid '+(on?m[1]:'#E3E7F2'), background:on?m[2]:'#fff', color:on?m[1]:'#7A80A3', font:`${on?'700':'600'} 11.5px 'Public Sans',sans-serif`, borderRadius:'8px', padding:'7px 13px', cursor:'pointer' } }; }),
        disabled: r.st === 'A' || !r.st,
        ot: r.ot || '', otChange: (ev) => setS({ att: { ...S.att, [attKey(e.id)]: { ...r, ot: ev.target.value.replace(/[^\d.]/g,'') } } }),
        work: r.work || '', workChange: (ev) => setS({ att: { ...S.att, [attKey(e.id)]: { ...r, work: ev.target.value } } }),
        otStyle: { width:'72px', border:'1px solid #E3E7F2', borderRadius:'8px', padding:'8px 10px', font:"600 12px 'Public Sans',sans-serif", color:'#22264A', background: (r.st==='A'||!r.st)?'#F4F6FB':'#FAFBFE', outline:'none' },
        workStyle: { width:'100%', border:'1px solid #E3E7F2', borderRadius:'8px', padding:'8px 10px', font:"500 12px 'Public Sans',sans-serif", color:'#22264A', background: (r.st==='A'||!r.st)?'#F4F6FB':'#FAFBFE', outline:'none' } }; });
    const markedToday = S.employees.filter(e => (S.att[attKey(e.id)]||{}).st).length;
    const cnt = (k) => S.employees.filter(e => (S.att[attKey(e.id)]||{}).st===k).length;
    const attSummary = [
      { v:String(markedToday)+' / '+S.employees.length, l:'Marked', style:{ background:'#EFF3FB', border:'1px solid #DDE4F3', borderRadius:'11px', padding:'12px 14px', color:'#2F308C' } },
      { v:String(cnt('P')), l:'Present', style:{ background:'#E4F6EC', border:'1px solid #C4E8D4', borderRadius:'11px', padding:'12px 14px', color:'#177049' } },
      { v:String(cnt('H')), l:'Half day', style:{ background:'#FDF3E7', border:'1px solid #F3DDBB', borderRadius:'11px', padding:'12px 14px', color:'#B4530A' } },
      { v:String(cnt('A')), l:'Absent', style:{ background:'#FCEDED', border:'1px solid #F2CBCB', borderRadius:'11px', padding:'12px 14px', color:'#B23334' } }
    ];
    // Report over range
    const dates = []; { let d = new Date(S.rpFrom+'T00:00:00'), end = new Date(S.rpTo+'T00:00:00');
      while (d <= end && dates.length < 62) { dates.push(isoLocal(d)); d.setDate(d.getDate()+1); } }
    const rpRows = S.employees.map((e,i) => { let p=0,a=0,h=0,ot=0; const works=[];
      dates.forEach(dt => { const r = S.att[dt+'|'+e.id]; if (!r || !r.st) return;
        if (r.st==='P') p++; else if (r.st==='A') a++; else h++;
        ot += parseFloat(r.ot||0) || 0; if (r.work) works.push(r.work); });
      const payDays = p + h*0.5;
      return { name:e.name, skill:e.desig||e.skill, type:e.type, init:initOf(e.name), avStyle:avatarStyle(i),
        typeStyle: this.pill(etOf(e.type)[0], etOf(e.type)[1]),
        p:String(p), a:String(a), h:String(h), ot: ot ? ot.toFixed(1)+' h' : '—',
        payDays: payDays.toFixed(1), work: works.length ? works.slice(0,2).join(' · ') : '—' }; });
    const rpTot = rpRows.reduce((s,r)=>({ p:s.p+ +r.p, a:s.a+ +r.a, h:s.h+ +r.h, pay:s.pay + parseFloat(r.payDays) }), {p:0,a:0,h:0,pay:0});
    // KNOWLEDGE BASE
    const kbQ = S.kbSearch.trim().toLowerCase();
    const kbFiltered = S.kbArticles.filter(a => !kbQ || (a.name+' '+a.desc).toLowerCase().includes(kbQ));
    const kbCards = kbFiltered.map(a => ({
      name:a.name, desc:a.desc, by:a.by, at:a.at, count: a.files.length + (a.files.length===1?' attachment':' attachments'),
      plain: (a.desc||'').replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim(),
      files: a.files.slice(0,3).map(mkFile),
      view: () => setS({ kbView: a.id }),
      edit: () => setS({ kbForm:'edit', kbName:a.name, kbDesc:a.desc, kbFiles:a.files, kbView:null, kbId:a.id }),
      del: () => { setS({ kbArticles: S.kbArticles.filter(x=>x.id!==a.id), kbView:null }); this.toast('"'+a.name+'" deleted from the knowledge base'); }
    }));
    const kbOpen = S.kbArticles.find(a => a.id === S.kbView);
    const kbDetail = kbOpen ? { name:kbOpen.name, desc:kbOpen.desc, by:kbOpen.by, at:kbOpen.at,
      descRef: (el) => { if (el) el.innerHTML = kbOpen.desc || ''; },
      count: kbOpen.files.length + (kbOpen.files.length===1?' attachment':' attachments'),
      files: kbOpen.files.map(f => ({ ...mkFile(f), download: () => this.toast('Downloading ' + (f.n || f.name || 'file') + '…') })),
      edit: () => setS({ kbForm:'edit', kbName:kbOpen.name, kbDesc:kbOpen.desc, kbFiles:kbOpen.files, kbId:kbOpen.id, kbView:null }),
      del: () => { setS({ kbArticles: S.kbArticles.filter(x=>x.id!==kbOpen.id), kbView:null }); this.toast('"'+kbOpen.name+'" deleted'); }
    } : { name:'', desc:'', by:'', at:'', count:'', files:[], descRef:()=>{}, edit:()=>{}, del:()=>{} };
    // LEAD DETAIL
    const ldObj = S.leads.find(l => l.id === S.selLead);
    const seedHist = [{ t:'create', txt:'Created in New', at:'04/09/2026, 12:40' }];
    const histOf = (x) => x.history || seedHist;
    const now = () => new Date().toLocaleString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    let ld = { name:'', budget:'', want:'', src:'', srcStyle:{}, stageName:'', mobile:'—', stepper:[], tabs:[], history:[], stageHist:[], notes:[], followups:[], flats:[], fields:[], lost:false, lostReason:'', lostRemarks:'' };
    const ldAvail = [];
    if (ldObj) {
      const stages = S.leadStages, curIdx = Math.max(0, stages.findIndex(s => s.id === ldObj.stage));
      const hist = histOf(ldObj);
      const hIcon = (t) => t==='stage' ? ['#6A46C8','#EFE9FC','↺'] : t==='note' ? ['#0672A6','#E3F2FC','✎'] : t==='fu' ? ['#B4530A','#FDF3E7','⏱'] : ['#4A5077','#EEF1F9','●'];
      ld = {
        name: ldObj.name, budget: ldObj.budget || '—', want: ldObj.want, src: ldObj.src,
        srcStyle: {...this.pill(srcOf(ldObj.src)[0], srcOf(ldObj.src)[1]), fontSize:'10px'},
        stageName: (stages[curIdx]||{}).name || '', mobile: ldObj.mobile || '—',
        lost: ldObj.stage === 'lost', lostReason: ldObj.lostReason || '', lostRemarks: ldObj.lostRemarks || '—',
        stepper: stages.map((st, i) => ({ name: st.name, hasLine: i > 0, mark: i < curIdx ? '✓' : String(i+1),
          style: { display:'flex', alignItems:'center', gap:'8px', border:'none', background: i===curIdx ? (st.id==='lost'?'#D8494A':'#191A5C') : 'transparent', color: i===curIdx?'#FFFFFF': i<curIdx?'#177049':'#7A80A3', font:`${i===curIdx?'700':'600'} 12.5px 'Public Sans',sans-serif`, borderRadius:'99px', padding:'7px 14px 7px 8px', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 },
          circleStyle: { width:'22px', height:'22px', borderRadius:'99px', display:'flex', alignItems:'center', justifyContent:'center', font:"700 10.5px 'Public Sans',sans-serif", background: i<curIdx?'#E4F6EC': i===curIdx?'rgba(255,255,255,.25)':'#EEF1F9', color: i<curIdx?'#177049': i===curIdx?'#fff':'#8A90B3', flexShrink:0 },
          pick: () => { if (st.id === ldObj.stage) return;
            if (st.id === 'lost') { setS({ lostFlow: ldObj.id, lostReason:'', lostRemarks:'' }); return; }
            setS({ leads: S.leads.map(x => x.id===ldObj.id ? { ...x, stage: st.id, lostReason: undefined, history: [{t:'stage', txt:'Stage moved '+((stages[curIdx]||{}).name||'')+' → '+st.name, at: now(), by:S.role, from:(stages[curIdx]||{}).name||'', to:st.name}, ...histOf(x)] } : x) });
            this.toast(ldObj.name + ' moved to ' + st.name); } })),
        tabs: [['timeline','Timeline'],['fus','Follow-ups'],['notes','Notes'],['shist','Stage History'],['files','Files'],['flats','Flats']].map(t => ({ label: t[1], pick: () => setS({ leadTab: t[0] }),
          style: { border:'none', borderBottom:'2.5px solid '+(S.leadTab===t[0]?'#0089C9':'transparent'), background:'transparent', color:S.leadTab===t[0]?'#191A5C':'#7A80A3', font:`${S.leadTab===t[0]?'700':'600'} 12.5px 'Public Sans',sans-serif`, padding:'12px 2px', cursor:'pointer', whiteSpace:'nowrap' } })),
        history: hist.map(h => ({ txt:h.txt, at:h.at, iconTxt:hIcon(h.t)[2], iconStyle:{ width:'30px', height:'30px', borderRadius:'99px', background:hIcon(h.t)[1], color:hIcon(h.t)[0], display:'flex', alignItems:'center', justifyContent:'center', font:"700 12px 'Public Sans',sans-serif", flexShrink:0 } })),
        stageHist: hist.filter(h => h.t==='stage' || h.t==='create').map(h => { const by = h.by || 'Owner / Admin';
          return { from: h.from || '—', to: h.to || (h.t==='create' ? 'New' : ''), txt:h.txt, at:h.at, by,
            isCreate: h.t==='create' || !h.from,
            avStyle: { width:'28px', height:'28px', borderRadius:'99px', background:'linear-gradient(140deg,#0089C9,#2F308C)', color:'#fff', font:"700 10px 'Public Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
            init: by.split(/[\s/]+/).map(w=>w[0]).join('').slice(0,2).toUpperCase(),
            fromStyle: this.pill('#7A80A3','#F1F4FB'), toStyle: this.pill('#2F308C','#EFF3FB') }; }),
        notes: (ldObj.notes || []).map(n => ({ ...n, by: n.by || 'Owner / Admin',
          avStyle: { width:'26px', height:'26px', borderRadius:'99px', background:'linear-gradient(140deg,#0089C9,#2F308C)', color:'#fff', font:"700 9.5px 'Public Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
          init: (n.by || 'Owner / Admin').split(/[\s/]+/).map(w=>w[0]).join('').slice(0,2).toUpperCase() })),
        followups: (ldObj.followups || []).slice().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(f => { const c = FUC[fuState(f)];
          return { type:f.type||'Call', when: fuFmt(f.date)+' · '+(f.time||''), remarks: f.remarks || '—', at:f.at, by: f.by || 'Owner / Admin',
            iconTxt: (f.type==='Site Visit Scheduled') ? '🏠' : '📞',
            typeStyle: { display:'inline-flex', alignItems:'center', gap:'5px', font:"800 9px 'Public Sans',sans-serif", letterSpacing:'.09em', color:'#fff', background: f.type==='Call'?'#0672A6':'#5636A8', borderRadius:'99px', padding:'4px 9px' },
            typeLabel: f.type==='Call' ? 'CALL' : 'SITE VISIT',
            iconStyle: { width:'34px', height:'34px', borderRadius:'9px', background:c.bg, border:'1px solid '+c.bd, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'15px', flexShrink:0 },
            rowStyle: { display:'flex', gap:'12px', alignItems:'center', padding:'11px 13px', marginBottom:'7px', background:c.bg, border:'1px solid '+c.bd, borderLeft:'4px solid '+c.fg, borderRadius:'10px' },
            whenStyle: { font:"700 12.5px 'Public Sans',sans-serif", color:c.fg, marginTop:'3px' },
            stStyle: { font:"800 9px 'Public Sans',sans-serif", color:'#fff', background:c.fg, borderRadius:'99px', padding:'3px 8px', letterSpacing:'.07em' },
            stLabel: c.label }; }),
        nextFUChip: (() => { const f = nextFU(ldObj); if (!f) return null; const c = FUC[fuState(f)];
          return { label: c.label, type:f.type, when: fuFmt(f.date)+' · '+f.time,
            style: { display:'flex', alignItems:'center', gap:'9px', background:c.bg, border:'1px solid '+c.bd, borderLeft:'4px solid '+c.fg, borderRadius:'10px', padding:'10px 13px' },
            badgeStyle: { font:"800 9px 'Public Sans',sans-serif", color:'#fff', background:c.fg, borderRadius:'99px', padding:'3px 8px', letterSpacing:'.07em' },
            textStyle: { font:"700 12.5px 'Public Sans',sans-serif", color:c.fg } }; })(),
        flats: (ldObj.flats || []).map(fl => ({ ...fl, release: () => { setS({ resv:{...S.resv,[fl.no]:{st:'A',who:null}}, leads:S.leads.map(x=>x.id===ldObj.id?{...x,flats:(x.flats||[]).filter(y=>y.no!==fl.no)}:x) }); this.toast('Unit '+fl.no+' released — back to Available'); } })),
        fields: S.leadFields.map(f => ({ k:f.label, v: f.label==='Name'?ldObj.name : f.label==='Source'?ldObj.src : f.label==='Budget'?(ldObj.budget||'—') : f.label==='Mobile number'?(ldObj.mobile||'—') : '—' }))
      };
      const lseq = ['A','A','B','A','H','A','B','B','A','A','B','B','A','H','A','A','B','A','B','A','A','A','B','A'];
      const tIdx = ['A','B','C'].indexOf(S.ldTower);
      for (let f = 12; f >= 1; f--) for (let u = 1; u <= 4; u++) {
        const no = S.ldTower + '-' + f + '0' + u;
        const st2 = S.resv[no] ? S.resv[no].st : lseq[(f*3 + u*5 + tIdx*7) % 24];
        if (st2 === 'A') { const plan = u <= 2 ? '2 BHK' : '3 BHK';
          ldAvail.push({ no, plan, book: () => { setS({ resv:{...S.resv,[no]:{st:'B',who:ldObj.name}}, leads:S.leads.map(x=>x.id===ldObj.id?{...x,flats:[...(x.flats||[]),{no,plan}], history:[{t:'stage',txt:'Unit '+no+' booked from Available Flats', at:now()},...histOf(x)]}:x) }); this.toast('Unit '+no+' booked for '+ldObj.name+' — board updated'); } }); }
      }
    }
    // MASTERS
    const MTABS = [['stores','Store Master'],['tax','Tax & UOM'],['users','Users & Roles'],['limits','Approval Limits'],['leadcfg','Lead Settings'],['workforce','Workforce Setup']];
    const masterNav = MTABS.map(m => ({ label:m[1], pick:()=>setS({masterTab:m[0]}),
      style:{ display:'block', width:'100%', textAlign:'left', border:'none', cursor:'pointer', borderRadius:'9px', padding:'10px 11px', font:`${S.masterTab===m[0]?'700':'600'} 12.5px 'Public Sans',sans-serif`, background:S.masterTab===m[0]?'linear-gradient(140deg,#0089C9,#2F308C)':'transparent', color:S.masterTab===m[0]?'#fff':'#5A6080' } }));
    const liveItems = items.filter(it => !isGone('item', it.code));
    const lowItems = liveItems.filter(x => x.low);
    const liveVendors = VDATA.filter(v => !isGone('vendor', v.name));
    const vendors = liveVendors.map(v => ({ ...v,
      init: v.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
      avStyle: { width:'38px', height:'38px', borderRadius:'10px', background:'linear-gradient(140deg,#0089C9,#2F308C)', color:'#fff', font:"700 12px 'Public Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
      catChips: v.cats.split('·').map(c=>({ c: c.trim() })),
      statusStyle: this.pill(v.status==='Active'?'#177049':'#B4530A', v.status==='Active'?'#E4F6EC':'#FDF3E7'),
      ontimeStyle: { font:"700 12.5px 'Public Sans',sans-serif", color: parseInt(v.ontime) >= 90 ? '#177049' : parseInt(v.ontime) >= 85 ? '#B4530A' : '#B23334' },
      ...rowActs('vendor', { code:v.code }, v.name, v.name),
      edit: () => setS({ vnBuild:'edit', vnDraft: { code:v.code, name:v.name, contact:v.contact, mobile:v.mobile, email:v.email, gst:v.gst, pan:v.pan, cats:v.cats, catList: (v.cats||'').split('·').map(c=>c.trim()).filter(Boolean), terms:v.terms, acct:v.acct||'', ifsc:v.ifsc||'', bankName:v.bankName||'', upi:v.upi||'', addr:v.addr } }),
      view: () => setS({ vnView: v }) })).filter(v=>!isGone('vendor', v.name));
    const roleC = { 'Owner / Admin':['#fff','#191A5C'], 'Project Manager':['#0672A6','#E3F2FC'], 'Supervisor':['#177049','#E4F6EC'], 'Store Manager':['#B4530A','#FDF3E7'], 'Sales':['#6A46C8','#EFE9FC'] };
    const UD = [
      { name:'Narendra Naidu', email:'nn@nninfra.in', role:'Owner / Admin', projects:'All projects', status:'Active' },
      { name:'Anil Deshpande', email:'anil.d@nninfra.in', role:'Project Manager', projects:'Skyline', status:'Active' },
      { name:'Kavitha Rao', email:'kavitha.r@nninfra.in', role:'Project Manager', projects:'Riverview · Trade Park', status:'Active' },
      { name:'R. Manjunath', email:'manju.r@nninfra.in', role:'Supervisor', projects:'Skyline · Tower B', status:'Active' },
      { name:'D. Shetty', email:'shetty.d@nninfra.in', role:'Store Manager', projects:'Skyline main store', status:'Active' },
      { name:'Meera Nair', email:'meera.n@nninfra.in', role:'Sales', projects:'Skyline · Riverview', status:'Active' },
      { name:'P. Gowda', email:'gowda.p@nninfra.in', role:'Supervisor', projects:'Meadows', status:'Invited' }
    ];
    const users = UD.map((u,i) => ({ ...u, init:u.name.split(' ').map(x=>x[0]).join('').slice(0,2),
      avStyle:{ width:'30px', height:'30px', borderRadius:'99px', background:avColors[i%4], color:'#fff', font:"700 10.5px 'Public Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
      roleStyle: this.pill(roleC[u.role][0], roleC[u.role][1]),
      stStyle: this.pill(u.status==='Active'?'#177049':'#B4530A', u.status==='Active'?'#E4F6EC':'#FDF3E7') }));
    const limits = [
      { doc:'Requirement Indent', rule:'PM approves up to ₹2.00 L', above:'Above → Owner / Admin' },
      { doc:'Purchase Order', rule:'PM approves up to ₹5.00 L', above:'Above → Owner / Admin' },
      { doc:'Vendor Payment', rule:'Store initiates · any value', above:'All → Owner approves' },
      { doc:'Sales Discount', rule:'Sales up to 1.0%', above:'Above → Owner / Admin' },
      { doc:'Booking Cancellation', rule:'No self-approval', above:'All → Owner / Admin' }
    ];
    const stores = [
      { name:'Skyline main store', loc:'On-site · Whitefield', skus:'142', val:'₹52.6 L' },
      { name:'Riverview store', loc:'On-site · Mysuru', skus:'98', val:'₹24.1 L' },
      { name:'Central store', loc:'Hebbal warehouse', skus:'64', val:'₹9.7 L' }
    ];
    const taxes = [ {name:'GST 5% — under-construction residential', rate:'5%'}, {name:'GST 12% — works contract', rate:'12%'}, {name:'GST 18% — services & most materials', rate:'18%'}, {name:'GST 28% — cement', rate:'28%'} ];
    const uoms = S.uomList;
    const greetName = { 'Owner / Admin':'Narendra', 'Project Manager':'Anil', 'Supervisor':'Manjunath', 'Store Manager':'Shetty', 'Sales':'Meera' }[S.role];
    return {
      loading: S.loading, role: S.role, roles, roleMenu: S.roleMenu,
      toggleRoleMenu: () => setS({ roleMenu: !S.roleMenu }),
      avatar: S.role.split(/[\s/]+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(),
      nav, screenTitle: TITLES[S.screen], toast: S.toast,
      greeting: 'Good morning, ' + greetName,
      isDash: S.screen==='dashboard', isProjects: S.screen==='projects', isTasks: S.screen==='tasks',
      // ===== SCHEDULE =====
      schIsPlan: S.schTab==='plan', schIsExt: S.schTab==='ext', schIsRpt: S.schTab==='rpt',
      schTabs: [['plan','Schedule'],['ext','Extension requests'],['rpt','Reports']].map(t => ({
        label: t[1], badge: t[0]==='ext' && extPending.length ? String(extPending.length) : false,
        pick: () => setS({ schTab: t[0], schAdd:null, extReq:null, apForm:null }),
        style: { display:'flex', alignItems:'center', gap:'7px', border:'1px solid ' + (S.schTab===t[0] ? '#0089C9' : '#E3E7F2'),
          background: S.schTab===t[0] ? '#E3F2FC' : '#fff', color: S.schTab===t[0] ? '#0672A6' : '#5A6080',
          font:"600 12px 'Public Sans',sans-serif", borderRadius:'99px', padding:'9px 15px', cursor:'pointer' },
        badgeStyle: { font:"800 9px 'Public Sans',sans-serif", color:'#fff', background:'#D8494A', borderRadius:'99px', padding:'2px 6px' } })),
      schProjOpts: schProjs.map(p => ({ p })), schProjSel: schKey,
      schProjChange: (e) => setS({ schProj: e.target.value, schAdd:null, extReq:null }),
      schStats: (() => { const rows = allSubs.filter(s => s.proj === schKey);
        const st = rows.filter(s => s.as), fin = rows.filter(s => s.status === 'Completed');
        const onS = st.filter(s => s.M.onStart).length, onD = fin.filter(s => s.M.onDone).length;
        const late = rows.filter(s => s.M.overdue).length;
        return [ { v: fin.length + ' of ' + rows.length, l:'Activities completed', c:'#2F308C', bg:'#EFF3FB', bd:'#DDE4F3' },
          { v: st.length ? onS + ' of ' + st.length : '—', l:'Started on time', c:'#177049', bg:'#E4F6EC', bd:'#C4E8D4' },
          { v: fin.length ? onD + ' of ' + fin.length : '—', l:'Completed on time', c:'#0672A6', bg:'#E3F2FC', bd:'#BFE0F2' },
          { v: String(late), l: late === 1 ? 'Activity overdue' : 'Activities overdue', c:'#B23334', bg:'#FCEDED', bd:'#F2CBCB' } ]; })(),
      schTree: schMains.map(m => {
        const subs = m.subs || [];
        const doneN = subs.filter(s => s.status === 'Completed').length;
        const allDone = subs.length > 0 && doneN === subs.length;
        const anyRun = subs.some(s => s.status === 'In progress');
        const mStatus = allDone ? 'Completed' : anyRun || doneN ? 'In progress' : 'Not started';
        const ps = minD(subs.map(s=>s.ps)), pe = maxD(subs.map(s=>revEnd(s)));
        const as = minD(subs.map(s=>s.as)), ae = allDone ? maxD(subs.map(s=>s.ae)) : '';
        const pct = subs.length ? Math.round(doneN/subs.length*100) : 0;
        return { name: m.name, pm: m.pm,
          status: mStatus, stStyle: this.pill(SST[mStatus][0], SST[mStatus][1]),
          plan: fmtD(ps) + ' → ' + fmtD(pe), planDays: dSpan(ps, pe) + ' days',
          act: as ? fmtD(as) + ' → ' + (ae ? fmtD(ae) : 'running') : 'not started',
          actDays: ae ? dSpan(as, ae) + ' days' : as ? dSpan(as, TODAY) + ' days so far' : '—',
          pctTxt: pct + '%', subCount: doneN + ' of ' + subs.length + ' sub-activities complete',
          barOuter: { height:'7px', background:'#EEF1F8', borderRadius:'99px', overflow:'hidden', marginTop:'7px', maxWidth:'220px' },
          barInner: { height:'100%', width: pct + '%', borderRadius:'99px', background: allDone ? 'linear-gradient(90deg,#1F9D66,#5BC8A2)' : 'linear-gradient(90deg,#0089C9,#5BC8F2)' },
          autoNote: allDone ? 'Auto-completed — every sub-activity is closed' : 'Completes automatically when all sub-activities are closed',
          addSub: () => setS({ schAdd: { kind:'sub', mid:m.id, name:'', ps:'', pe:'' }, extReq:null }),
          rows: subs.map(s => { const M = sMetrics(s);
            const pd = M.pend;
            return { name: s.name, status: s.status, stStyle: this.pill(SST[s.status][0], SST[s.status][1]),
              plan: fmtD(s.ps) + ' → ' + fmtD(s.pe), planDays: M.planDays + ' days',
              revised: M.ext ? fmtD(M.re) + '  (+' + M.ext + ' d)' : '—',
              hasRev: M.ext > 0,
              act: s.as ? fmtD(s.as) + ' → ' + (s.ae ? fmtD(s.ae) : 'running') : '—',
              actDays: s.ae ? M.actDays + ' days' : s.as ? dSpan(s.as, TODAY) + ' days so far' : '—',
              startTag: !s.as ? '' : M.onStart ? '✓ On-time start' : '▲ Late start ' + M.startVar + ' d',
              startStyle: this.pill(M.onStart ? '#177049' : '#B4530A', M.onStart ? '#E4F6EC' : '#FDF3E7'),
              doneTag: s.status !== 'Completed' ? '' : M.onDone ? '✓ On-time completion' : '▲ Late by ' + M.revVar + ' d',
              doneStyle: this.pill(M.onDone ? '#177049' : '#B23334', M.onDone ? '#E4F6EC' : '#FCEDED'),
              flag: M.overdue ? 'OVERDUE' : M.dueToday ? 'DUE TODAY' : M.startToday ? 'START TODAY' : M.startDue && s.status === 'Not started' ? 'START OVERDUE' : '',
              flagStyle: { display:'inline-flex', font:"800 8.5px 'Public Sans',sans-serif", letterSpacing:'.07em', color:'#fff', borderRadius:'99px', padding:'4px 9px',
                background: M.overdue || (M.startDue && s.status === 'Not started') ? '#D8494A' : M.dueToday ? '#E8A13A' : '#0089C9' },
              rowStyle: { display:'grid', gridTemplateColumns:'minmax(200px,1.5fr) 190px 150px 190px minmax(180px,1fr) 210px', minWidth:'1150px',
                gap:'12px', alignItems:'center', padding:'13px 20px 13px 44px', borderBottom:'1px solid #F2F5FB',
                background: M.overdue ? '#FEF7F7' : 'transparent' },
              canStart: !s.as && s.status === 'Not started',
              canDone: s.status === 'In progress',
              canExt: s.status !== 'Completed' && !pd,
              pendTxt: pd ? (pd.pmStatus === 'Pending' ? 'Extension +' + pd.days + ' d · awaiting PM' : 'Extension +' + pd.days + ' d · awaiting Admin') : '',
              pendStyle: this.pill('#B4530A', '#FDF3E7'),
              extLog: (s.exts||[]).map(e => ({ txt: '+' + e.days + ' d · ' + e.reason,
                meta: e.admStatus === 'Approved' ? 'Granted to ' + fmtD(e.newEnd) + ' · ' + e.verdict + ' · ' + e.admBy : e.pmStatus === 'Rejected' ? 'Rejected by ' + e.pmBy : 'Pending approval',
                vStyle: this.pill(e.admStatus === 'Approved' ? (e.verdict === 'Genuine' ? '#177049' : '#B4530A') : e.pmStatus === 'Rejected' ? '#B23334' : '#5A6080',
                  e.admStatus === 'Approved' ? (e.verdict === 'Genuine' ? '#E4F6EC' : '#FDF3E7') : e.pmStatus === 'Rejected' ? '#FCEDED' : '#F1F4FB') })),
              start: () => { patchSub(m.id, s.id, { as: TODAY, status:'In progress' });
                this.toast(s.name + ' started ' + fmtD(TODAY) + (s.ps < TODAY ? ' — ' + dGap(s.ps, TODAY) + ' days late' : ' — on time')); },
              complete: () => { patchSub(m.id, s.id, { ae: TODAY, status:'Completed' });
                const re = revEnd(s);
                this.toast(s.name + ' completed ' + fmtD(TODAY) + (TODAY <= re ? ' — on time' : ' — ' + dGap(re, TODAY) + ' days late')); },
              reqExt: () => setS({ extReq: { mid:m.id, sid:s.id, act:s.name, cur:M.re, days:'', reason:'' }, schAdd:null }) }; }) }; }),
      schAddMain: () => setS({ schAdd: { kind:'main', name:'', pm:'', ps:'', pe:'' }, extReq:null }),
      schAddOpen: !!S.schAdd,
      schAddTitle: (S.schAdd||{}).kind === 'main' ? 'New main category' : 'New sub-activity',
      schAddName: (S.schAdd||{}).name || '', schAddNameChange: (e) => { const v = e.target.value; this.setState(st => ({ schAdd: { ...st.schAdd, name: v } })); },
      schAddPs: (S.schAdd||{}).ps || '', schAddPsChange: (e) => { const v = e.target.value; this.setState(st => ({ schAdd: { ...st.schAdd, ps: v } })); },
      schAddPe: (S.schAdd||{}).pe || '', schAddPeChange: (e) => { const v = e.target.value; this.setState(st => ({ schAdd: { ...st.schAdd, pe: v } })); },
      schAddIsMain: (S.schAdd||{}).kind === 'main',
      schAddPm: (S.schAdd||{}).pm || '', schAddPmChange: (e) => { const v = e.target.value; this.setState(st => ({ schAdd: { ...st.schAdd, pm: v } })); },
      schAddDays: (() => { const a = S.schAdd||{}; const d = dSpan(a.ps, a.pe); return d ? d + ' days' : 'Pick both dates'; })(),
      schAddCancel: () => setS({ schAdd: null }),
      schAddSave: () => { const a = S.schAdd || {};
        if (!a.name || !a.ps || !a.pe) { this.toast('Name, planned start and planned end are required'); return; }
        if (a.pe < a.ps) { this.toast('Planned end cannot be before planned start'); return; }
        if (a.kind === 'main') {
          const [project, tower] = schKey.split(' · ');
          schWrite([...SCHED, { id:'M'+(SCHED.length+1)+Date.now().toString().slice(-3), project, tower, name:a.name,
            pm: a.pm || (schMains[0]||{}).pm || 'Anil Deshpande',
            subs:[{ id:'S'+Date.now().toString().slice(-5), name:a.name + ' · works', ps:a.ps, pe:a.pe, status:'Not started' }] }]);
          this.toast('Main category "' + a.name + '" added with its first sub-activity');
        } else {
          schWrite(SCHED.map(m => m.id !== a.mid ? m : { ...m, subs:[...m.subs, { id:'S'+Date.now().toString().slice(-5), name:a.name, ps:a.ps, pe:a.pe, status:'Not started' }] }));
          this.toast('Sub-activity "' + a.name + '" added');
        }
        setS({ schAdd: null }); },
      extReqOpen: !!S.extReq,
      extReqAct: (S.extReq||{}).act || '', extReqCur: fmtD((S.extReq||{}).cur),
      extReqDays: (S.extReq||{}).days || '', extReqDaysChange: (e) => { const v = e.target.value; this.setState(st => ({ extReq: { ...st.extReq, days: v } })); },
      extReqReason: (S.extReq||{}).reason || '', extReqReasonChange: (e) => { const v = e.target.value; this.setState(st => ({ extReq: { ...st.extReq, reason: v } })); },
      extReqNew: (() => { const r = S.extReq || {}; const d = parseInt(r.days)||0;
        if (!d || !r.cur) return '—'; const nd = new Date(r.cur+'T00:00:00'); nd.setDate(nd.getDate()+d);
        return fmtD(nd.getFullYear()+'-'+String(nd.getMonth()+1).padStart(2,'0')+'-'+String(nd.getDate()).padStart(2,'0')); })(),
      extReqCancel: () => setS({ extReq: null }),
      extReqSave: () => { const r = S.extReq || {};
        if (!r.days || !r.reason) { this.toast('Extension days and reason are both required'); return; }
        const nd = new Date(r.cur+'T00:00:00'); nd.setDate(nd.getDate() + (parseInt(r.days)||0));
        const iso = nd.getFullYear()+'-'+String(nd.getMonth()+1).padStart(2,'0')+'-'+String(nd.getDate()).padStart(2,'0');
        const src = SCHED.find(m => m.id === r.mid).subs.find(s => s.id === r.sid);
        patchSub(r.mid, r.sid, { exts: [...(src.exts||[]), { id:'E'+Date.now().toString().slice(-5), days:String(r.days), reason:r.reason,
          by: S.role, at: nowStamp(), pmStatus:'Pending', wantEnd: iso }] });
        setS({ extReq: null });
        this.toast('Extension of ' + r.days + ' days requested — sent to the Project Manager'); },
      extRows: extPending.map(e => { const stage = e.pmStatus === 'Pending' ? 'pm' : 'adm';
        return { id:e.id, act:e.act, main:e.main, proj:e.proj, days:'+' + e.days + ' days', reason:e.reason, by:e.by, at:e.at,
          cur: fmtD(e.cur), pm:e.pm,
          want: (() => { if (e.wantEnd) return fmtD(e.wantEnd);
            const d = new Date(e.cur + 'T00:00:00'); d.setDate(d.getDate() + (parseInt(e.days)||0));
            return fmtD(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')); })(),
          stage: stage === 'pm' ? 'AWAITING PROJECT MANAGER' : 'AWAITING ADMIN',
          stageStyle: { display:'inline-flex', font:"800 8.5px 'Public Sans',sans-serif", letterSpacing:'.07em', color:'#fff',
            borderRadius:'99px', padding:'4px 9px', background: stage === 'pm' ? '#E8A13A' : '#6A46C8' },
          pmDone: stage === 'adm', pmRemark: e.pmRemark || '', pmBy: e.pmBy || '', pmAt: e.pmAt || '',
          canAct: stage === 'pm' ? isPM : isAdmin,
          actLabel: stage === 'pm' ? 'PM decision' : 'Admin decision',
          waitTxt: stage === 'pm' ? 'Only the Project Manager can act on this request' : 'Only the Admin can grant the revised date',
          open: () => { let ne = e.wantEnd;
            if (!ne) { const d = new Date(e.cur + 'T00:00:00'); d.setDate(d.getDate() + (parseInt(e.days)||0));
              ne = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
            setS({ apForm: { ...e, stage, remark:'', newEnd: ne, verdict:'Genuine' } }); } }; }),
      extEmpty: extPending.length === 0,
      extCount: extPending.length + (extPending.length === 1 ? ' request awaiting action' : ' requests awaiting action'),
      apOpen: !!S.apForm,
      apD: (() => { const a = S.apForm; if (!a) return { verdicts: [] };
        return { act:a.act, main:a.main, proj:a.proj, days:'+' + a.days + ' days', reason:a.reason, by:a.by, at:a.at,
          cur: fmtD(a.cur), isPMStage: a.stage === 'pm', isAdmStage: a.stage === 'adm',
          title: a.stage === 'pm' ? 'Project Manager approval' : 'Admin approval & revised date',
          pmRemark: a.pmRemark || '—', pmBy: a.pmBy || '', pmAt: a.pmAt || '',
          remark: a.remark, remarkChange: (e) => { const v = e.target.value; this.setState(st => ({ apForm: { ...st.apForm, remark: v } })); },
          newEnd: a.newEnd, newEndChange: (e) => { const v = e.target.value; this.setState(st => ({ apForm: { ...st.apForm, newEnd: v } })); },
          newDaysTxt: (() => { const g = dGap(a.cur, a.newEnd); return g === null ? '—' : (g > 0 ? '+' + g + ' days beyond the current target' : g === 0 ? 'Same as current target' : g + ' days'); })(),
          verdicts: [['Genuine','Genuine reason — no impact on PM performance'],['Avoidable','Avoidable — counts against PM performance']].map(v => ({
            label: v[1], on: a.verdict === v[0], pick: () => this.setState(st => ({ apForm: { ...st.apForm, verdict: v[0] } })),
            style: { display:'flex', alignItems:'flex-start', gap:'9px', textAlign:'left', width:'100%', cursor:'pointer',
              border:'1px solid ' + (a.verdict === v[0] ? (v[0] === 'Genuine' ? '#9AD4B4' : '#F3DDBB') : '#E9EDF6'),
              background: a.verdict === v[0] ? (v[0] === 'Genuine' ? '#E4F6EC' : '#FDF3E7') : '#FAFBFE',
              borderRadius:'9px', padding:'11px 13px' },
            dotStyle: { width:'15px', height:'15px', borderRadius:'99px', flexShrink:0, marginTop:'1px',
              border:'1.5px solid ' + (a.verdict === v[0] ? (v[0] === 'Genuine' ? '#177049' : '#B4530A') : '#C6CFE8'),
              background: a.verdict === v[0] ? (v[0] === 'Genuine' ? '#177049' : '#B4530A') : '#fff' },
            txtStyle: { font:"600 12px 'Public Sans',sans-serif", color: a.verdict === v[0] ? (v[0] === 'Genuine' ? '#177049' : '#8A5A12') : '#5A6080' } })),
          cancel: () => setS({ apForm: null }),
          reject: () => { const src = SCHED.find(m => m.id === a.mid).subs.find(s => s.id === a.sid);
            if (!a.remark) { this.toast('A remark is required when rejecting'); return; }
            patchSub(a.mid, a.sid, { exts: (src.exts||[]).map(x => x.id !== a.id ? x : { ...x,
              pmStatus: a.stage === 'pm' ? 'Rejected' : x.pmStatus, admStatus: a.stage === 'adm' ? 'Rejected' : x.admStatus,
              pmRemark: a.stage === 'pm' ? a.remark : x.pmRemark, pmBy: a.stage === 'pm' ? S.role : x.pmBy, pmAt: a.stage === 'pm' ? nowStamp() : x.pmAt,
              admRemark: a.stage === 'adm' ? a.remark : x.admRemark, admBy: a.stage === 'adm' ? S.role : x.admBy, admAt: a.stage === 'adm' ? nowStamp() : x.admAt }) });
            setS({ apForm: null }); this.toast('Extension request rejected — target date unchanged'); },
          approve: () => { const src = SCHED.find(m => m.id === a.mid).subs.find(s => s.id === a.sid);
            if (a.stage === 'pm') {
              if (!a.remark) { this.toast('Add a remark for the Admin before forwarding'); return; }
              patchSub(a.mid, a.sid, { exts: (src.exts||[]).map(x => x.id !== a.id ? x : { ...x,
                pmStatus:'Approved', pmRemark:a.remark, pmBy:S.role, pmAt:nowStamp(), admStatus:'Pending' }) });
              setS({ apForm: null }); this.toast('Approved by Project Manager — forwarded to Admin for the revised date');
            } else {
              if (!a.newEnd) { this.toast('Set the revised completion date'); return; }
              patchSub(a.mid, a.sid, { exts: (src.exts||[]).map(x => x.id !== a.id ? x : { ...x,
                admStatus:'Approved', admRemark:a.remark, admBy:S.role, admAt:nowStamp(), newEnd:a.newEnd, verdict:a.verdict }) });
              setS({ apForm: null });
              this.toast('Extension granted to ' + fmtD(a.newEnd) + ' · ' + (a.verdict === 'Genuine' ? 'no impact on PM performance' : 'counted against PM performance'));
            } } }; })(),
      extHist: extQueue.filter(e => e.admStatus === 'Approved' || e.pmStatus === 'Rejected' || e.admStatus === 'Rejected').map(e => ({
        act:e.act, main:e.main, proj:e.proj, days:'+' + e.days + ' d', reason:e.reason, by:e.by, at:e.at, pm:e.pm,
        pmRemark: e.pmRemark || '—', admRemark: e.admRemark || '—',
        result: e.admStatus === 'Approved' ? 'Granted to ' + fmtD(e.newEnd) : 'Rejected',
        rStyle: this.pill(e.admStatus === 'Approved' ? '#177049' : '#B23334', e.admStatus === 'Approved' ? '#E4F6EC' : '#FCEDED'),
        verdict: e.verdict || '—',
        vStyle: this.pill(e.verdict === 'Genuine' ? '#177049' : e.verdict === 'Avoidable' ? '#B4530A' : '#5A6080',
          e.verdict === 'Genuine' ? '#E4F6EC' : e.verdict === 'Avoidable' ? '#FDF3E7' : '#F1F4FB') })),
      extHistEmpty: extQueue.filter(e => e.admStatus === 'Approved' || e.pmStatus === 'Rejected').length === 0,
      schRptIsPlan: S.schRpt === 'plan', schRptIsPerf: S.schRpt === 'perf',
      schRptTabs: [['plan','Schedule vs actual'],['perf','Project Manager performance']].map(t => ({
        label: t[1], pick: () => setS({ schRpt: t[0] }),
        style: { border:'1px solid ' + (S.schRpt===t[0] ? '#0089C9' : '#E3E7F2'), background: S.schRpt===t[0] ? '#E3F2FC' : '#fff',
          color: S.schRpt===t[0] ? '#0672A6' : '#5A6080', font:"600 11.5px 'Public Sans',sans-serif", borderRadius:'99px', padding:'8px 14px', cursor:'pointer' } })),
      rptRows: allSubs.filter(s => s.proj === schKey).map(s => { const M = s.M;
        const v = s.ae ? M.revVar : null;
        return { main:s.main, act:s.name, status:s.status, stStyle: this.pill(SST[s.status][0], SST[s.status][1]),
          ps: fmtD(s.ps), pe: fmtD(s.pe), planDays: String(M.planDays),
          re: M.ext ? fmtD(M.re) : '—', extDays: M.ext ? '+' + M.ext : '—',
          as: s.as ? fmtD(s.as) : '—', ae: s.ae ? fmtD(s.ae) : '—',
          actDays: s.ae ? String(M.actDays) : s.as ? dSpan(s.as, TODAY) + '*' : '—',
          diff: v === null ? '—' : (v > 0 ? '+' + v + ' d' : v === 0 ? 'on time' : v + ' d'),
          diffStyle: { font:"700 12px 'Public Sans',sans-serif", color: v === null ? '#9BA1C2' : v > 0 ? '#B23334' : '#177049' },
          onS: !s.as ? '—' : M.onStart ? '✓' : '✗', onSStyle: { font:"800 13px 'Public Sans',sans-serif", color: !s.as ? '#C6CFE8' : M.onStart ? '#177049' : '#B23334' },
          onD: s.status !== 'Completed' ? '—' : M.onDone ? '✓' : '✗', onDStyle: { font:"800 13px 'Public Sans',sans-serif", color: s.status !== 'Completed' ? '#C6CFE8' : M.onDone ? '#177049' : '#B23334' },
          remarks: (s.exts||[]).length ? (s.exts||[]).map(e => e.reason).join(' · ') : '—' }; }),
      rptTot: (() => { const rows = allSubs.filter(s => s.proj === schKey);
        const pd = rows.reduce((n,s) => n + s.M.planDays, 0);
        const ad = rows.filter(s=>s.ae).reduce((n,s) => n + s.M.actDays, 0);
        const ex = rows.reduce((n,s) => n + s.M.ext, 0);
        const slip = rows.filter(s=>s.ae).reduce((n,s) => n + Math.max(0, s.M.revVar||0), 0);
        return { plan: pd + ' d', act: ad + ' d', ext: '+' + ex + ' d', slip: slip ? '+' + slip + ' d' : 'nil',
          slipStyle: { font:"800 18px 'Sora',sans-serif", color: slip ? '#B23334' : '#177049', marginTop:'3px' } }; })(),
      perfRows: pmPerf.map(p => ({ pm:p.pm, activities: String(p.activities),
        onS: p.onS + ' of ' + p.started, onD: p.onD + ' of ' + p.fin,
        onSPct: p.onSPct + '%', onDPct: p.onDPct + '%',
        gen: String(p.gen), avo: String(p.avo),
        penalty: p.avo ? '−' + (p.avo * 10) : '—',
        score: String(p.score),
        scoreStyle: { font:"800 19px 'Sora',sans-serif", color: p.score >= 85 ? '#177049' : p.score >= 70 ? '#B4530A' : '#B23334' },
        barOuter: { height:'8px', background:'#EEF1F8', borderRadius:'99px', overflow:'hidden', marginTop:'7px' },
        barInner: { height:'100%', width: p.score + '%', borderRadius:'99px',
          background: p.score >= 85 ? 'linear-gradient(90deg,#1F9D66,#5BC8A2)' : p.score >= 70 ? 'linear-gradient(90deg,#E8A13A,#F2C063)' : 'linear-gradient(90deg,#D8494A,#E8827F)' },
        note: p.avo ? p.avo + ' avoidable extension' + (p.avo === 1 ? '' : 's') + ' counted against the score' : 'No avoidable extensions — genuine delays excluded' })),
      perfNote: 'On-time start and on-time completion are scored equally. Extensions the Admin marked “Genuine” are excluded; each “Avoidable” extension costs 10 points.',
      schAlertCards: [
        { k:'start', label:'To start', count: String(schAlerts.start.length), c:'#0672A6', bg:'#E3F2FC', bd:'#BFE0F2',
          items: schAlerts.start.slice(0,4).map(s => ({ txt: s.name, meta: s.proj + ' · planned ' + fmtD(s.ps) })), empty: schAlerts.start.length === 0 },
        { k:'due', label:'Due today', count: String(schAlerts.due.length), c:'#B4530A', bg:'#FDF3E7', bd:'#F3DDBB',
          items: schAlerts.due.slice(0,4).map(s => ({ txt: s.name, meta: s.proj + ' · target ' + fmtD(s.M.re) })), empty: schAlerts.due.length === 0 },
        { k:'over', label:'Overdue', count: String(schAlerts.over.length), c:'#B23334', bg:'#FCEDED', bd:'#F2CBCB',
          items: schAlerts.over.slice(0,4).map(s => ({ txt: s.name, meta: s.proj + ' · target ' + fmtD(s.M.re) + ' · ' + dGap(s.M.re, TODAY) + ' d late' })), empty: schAlerts.over.length === 0 } ],
      schAlertGo: () => setS({ screen:'schedule', schTab:'plan' }),
      // ===== CHECKLISTS =====
      clIsLib: S.clTab === 'lib', clIsRuns: S.clTab === 'runs',
      clTabs: [['lib','Checklist library'],['runs','Site inspections']].map(t => ({
        label: t[1], pick: () => setS({ clTab: t[0], clCatForm:null, clForm:null, cpEdit:null }),
        style: { border:'1px solid ' + (S.clTab===t[0] ? '#0089C9' : '#E3E7F2'), background: S.clTab===t[0] ? '#E3F2FC' : '#fff',
          color: S.clTab===t[0] ? '#0672A6' : '#5A6080', font:"600 12px 'Public Sans',sans-serif", borderRadius:'99px', padding:'9px 15px', cursor:'pointer' } })),
      clOrgNote: CLCATS.length + ' categories · ' + CLISTS.length + ' checklists · defined once at organisation level and reused across every project',
      clCats: CLCATS.map(c => { const n = CLISTS.filter(l => l.catId === c.id).length;
        const on = c.id === clCatSel;
        return { name: c.name, code: c.code, count: String(n),
          style: { display:'flex', justifyContent:'space-between', alignItems:'center', gap:'8px', width:'100%', textAlign:'left',
            border:'1px solid ' + (on ? '#0089C9' : 'transparent'), background: on ? '#E3F2FC' : 'transparent',
            borderRadius:'9px', padding:'10px 11px', cursor:'pointer' },
          nameStyle: { font:(on ? '700' : '600') + " 12.5px 'Public Sans',sans-serif", color: on ? '#0672A6' : '#3A3F5C' },
          cntStyle: { font:"700 10.5px 'Public Sans',sans-serif", color: on ? '#0672A6' : '#8A90B3', background: on ? '#CBE5F5' : '#F1F4FB', borderRadius:'99px', padding:'3px 8px' },
          pick: () => setS({ clCatSel: c.id, clSel: null, clCatForm:null, clForm:null, cpEdit:null }) }; }),
      clCatNew: () => setS({ clCatForm: { mode:'new', name:'', code:'', note:'' }, clForm:null }),
      clCatFormOpen: !!S.clCatForm,
      clCatF: (() => { const f = S.clCatForm || {};
        return { title: f.mode === 'edit' ? 'Edit category' : 'New category',
          name: f.name || '', nameChange: (e) => { const v = e.target.value; this.setState(st => ({ clCatForm: { ...st.clCatForm, name: v } })); },
          code: f.code || '', codeChange: (e) => { const v = e.target.value.toUpperCase().slice(0,4); this.setState(st => ({ clCatForm: { ...st.clCatForm, code: v } })); },
          note: f.note || '', noteChange: (e) => { const v = e.target.value; this.setState(st => ({ clCatForm: { ...st.clCatForm, note: v } })); },
          cancel: () => setS({ clCatForm: null }),
          save: () => { if (!f.name) { this.toast('Category name is required'); return; }
            if (f.mode === 'edit') { writeCats(CLCATS.map(c => c.id === f.id ? { ...c, name:f.name, code:f.code, note:f.note } : c));
              this.toast('Category updated'); }
            else { const id = nid('C'); writeCats([...CLCATS, { id, name:f.name, code: f.code || f.name.slice(0,3).toUpperCase(), note:f.note }]);
              setS({ clCatSel: id }); this.toast('Category "' + f.name + '" added — available to every project'); }
            setS({ clCatForm: null }); } }; })(),
      clCatHead: catObj.name, clCatCode: catObj.code, clCatNote: catObj.note || '—',
      clCatEdit: () => setS({ clCatForm: { mode:'edit', id:catObj.id, name:catObj.name, code:catObj.code, note:catObj.note || '' }, clForm:null }),
      clCatDel: () => { if (catLists.length) { this.toast('“' + catObj.name + '” still has ' + catLists.length + ' checklist(s) — delete or move them first'); return; }
        if (CLCATS.length === 1) { this.toast('At least one category must remain'); return; }
        setS({ confirmDel: { label: catObj.name + ' category', run: () => { writeCats(CLCATS.filter(c => c.id !== catObj.id)); setS({ clCatSel:null, confirmDel:null }); this.toast('Category deleted'); } } }); },
      clLists: catLists.map(l => { const on = l.id === clSel;
        return { name: l.name, ver: l.ver || 'v1.0', count: (l.points||[]).length + ' checkpoints',
          style: { width:'100%', textAlign:'left', border:'1px solid ' + (on ? '#0089C9' : '#E9EDF6'), background: on ? '#E3F2FC' : '#FAFBFE',
            borderRadius:'10px', padding:'11px 13px', cursor:'pointer' },
          nameStyle: { font:(on ? '700' : '600') + " 12.5px 'Public Sans',sans-serif", color: on ? '#0672A6' : '#22264A' },
          pick: () => setS({ clSel: l.id, clForm:null, cpEdit:null }) }; }),
      clListsEmpty: catLists.length === 0,
      clListNew: () => setS({ clForm: { mode:'new', name:'', ver:'v1.0' }, clCatForm:null }),
      clFormOpen: !!S.clForm,
      clF: (() => { const f = S.clForm || {};
        return { title: f.mode === 'edit' ? 'Rename checklist' : 'New checklist in ' + catObj.name,
          name: f.name || '', nameChange: (e) => { const v = e.target.value; this.setState(st => ({ clForm: { ...st.clForm, name: v } })); },
          ver: f.ver || '', verChange: (e) => { const v = e.target.value; this.setState(st => ({ clForm: { ...st.clForm, ver: v } })); },
          cancel: () => setS({ clForm: null }),
          save: () => { if (!f.name) { this.toast('Checklist name is required'); return; }
            if (f.mode === 'edit') { patchList(f.id, { name:f.name, ver:f.ver }); this.toast('Checklist updated'); }
            else { const id = nid('L'); writeLists([...CLISTS, { id, catId:clCatSel, name:f.name, ver: f.ver || 'v1.0', points:[] }]);
              setS({ clSel: id }); this.toast('Checklist "' + f.name + '" created — add its checkpoints'); }
            setS({ clForm: null }); } }; })(),
      clHasList: !!listObj, clNoList: !listObj,
      clD: (() => { const l = listObj; if (!l) return { points: [] };
        const pts = l.points || [];
        return { name: l.name, ver: l.ver || 'v1.0', cat: catObj.name,
          count: pts.length + (pts.length === 1 ? ' checkpoint' : ' checkpoints'),
          mand: pts.filter(p => p.mand).length + ' mandatory',
          empty: pts.length === 0,
          points: pts.map((p, i) => ({ seq: String(i+1).padStart(2,'0'), txt: p.txt,
            mand: p.mand ? 'MANDATORY' : 'OPTIONAL',
            mandStyle: { font:"800 8.5px 'Public Sans',sans-serif", letterSpacing:'.07em', color:'#fff', borderRadius:'99px', padding:'3px 8px',
              background: p.mand ? '#D8494A' : '#9BA1C2' },
            seqStyle: { font:"800 12px 'Sora',sans-serif", color:'#0672A6', background:'#E3F2FC', borderRadius:'8px', padding:'6px 9px', flexShrink:0 },
            isFirst: i === 0, isLast: i === pts.length - 1,
            editing: (S.cpEdit||{}).id === p.id, notEditing: (S.cpEdit||{}).id !== p.id,
            editTxt: (S.cpEdit||{}).txt || '',
            editChange: (e) => { const v = e.target.value; this.setState(st => ({ cpEdit: { ...st.cpEdit, txt: v } })); },
            editSave: () => { const t = (S.cpEdit||{}).txt;
              if (!t) { this.toast('Checkpoint text cannot be empty'); return; }
              patchList(l.id, { points: pts.map(x => x.id === p.id ? { ...x, txt: t } : x) });
              setS({ cpEdit: null }); this.toast('Checkpoint ' + (i+1) + ' updated'); },
            editCancel: () => setS({ cpEdit: null }),
            edit: () => setS({ cpEdit: { id: p.id, txt: p.txt } }),
            toggleMand: () => patchList(l.id, { points: pts.map(x => x.id === p.id ? { ...x, mand: !x.mand } : x) }),
            up: () => { if (i === 0) return; const n = pts.slice(); n[i-1] = pts[i]; n[i] = pts[i-1]; patchList(l.id, { points: n }); },
            down: () => { if (i === pts.length-1) return; const n = pts.slice(); n[i+1] = pts[i]; n[i] = pts[i+1]; patchList(l.id, { points: n }); },
            del: () => setS({ confirmDel: { label: 'checkpoint ' + (i+1), run: () => {
              patchList(l.id, { points: pts.filter(x => x.id !== p.id) }); setS({ confirmDel: null }); this.toast('Checkpoint removed — sequence renumbered'); } } }) })),
          cpNew: S.cpNew, cpNewChange: (e) => { const v = e.target.value; setS({ cpNew: v }); },
          cpAdd: () => { const t = (S.cpNew||'').trim(); if (!t) { this.toast('Type the checkpoint first'); return; }
            patchList(l.id, { points: [...pts, { id: nid('P'), txt: t, mand: true }] });
            setS({ cpNew: '' }); this.toast('Checkpoint ' + (pts.length+1) + ' added'); },
          rename: () => setS({ clForm: { mode:'edit', id:l.id, name:l.name, ver:l.ver }, clCatForm:null }),
          dup: () => { const id = nid('L');
            writeLists([...CLISTS, { ...l, id, name: l.name + ' (copy)', points: (l.points||[]).map(p => ({ ...p, id: nid('P') })) }]);
            setS({ clSel: id }); this.toast('Checklist duplicated — edit the copy'); },
          del: () => setS({ confirmDel: { label: l.name, run: () => { writeLists(CLISTS.filter(x => x.id !== l.id)); setS({ clSel:null, confirmDel:null }); this.toast('Checklist deleted'); } } }) }; })(),
      isChecks: S.screen==='checklists', isSchedule: S.screen==='schedule', isProc: ['indents','pos','grn','items','vendors'].includes(S.screen),
      isLeads: S.screen==='leads', isFlats: S.screen==='flats', isMasters: S.screen==='masters',
      isFollowups: S.screen==='followups',
      isHR: S.screen==='hr' && S.empView==null,
      isEmpView: S.screen==='hr' && S.empView!=null, empDetail, empBack: () => setS({ empView:null }),
      evFrom:S.evFrom, evFromChange:(e)=>setS({evFrom:e.target.value}),
      evTo:S.evTo, evToChange:(e)=>setS({evTo:e.target.value}),
      hrTabs: [['staff','Employees'],['mark','Mark Attendance'],['report','Attendance Report']].map(t => ({ label:t[1], pick:()=>setS({hrTab:t[0]}),
        style:{ border:'none', borderBottom:'2.5px solid '+(S.hrTab===t[0]?'#0089C9':'transparent'), background:'transparent', color:S.hrTab===t[0]?'#191A5C':'#7A80A3', font:`${S.hrTab===t[0]?'700':'600'} 13px 'Public Sans',sans-serif`, padding:'11px 4px', cursor:'pointer' } })),
      hrStaff: S.hrTab==='staff', hrMark: S.hrTab==='mark', hrReport: S.hrTab==='report',
      empRows, empCount: S.employees.length + ' employees on record',
      empTypeChips: S.empTypes.map((t,i) => ({ label:t, count: S.employees.filter(e=>e.type===t).length,
        canDel: S.employees.filter(e=>e.type===t).length===0,
        del: () => setS({ empTypes: S.empTypes.filter((_,xi)=>xi!==i) }),
        style: { display:'inline-flex', alignItems:'center', gap:'7px', ...this.pill(etOf(t)[0], etOf(t)[1]), fontSize:'11.5px', padding:'7px 12px' } })),
      newEType: S.newEType, newETypeChange:(e)=>setS({newEType:e.target.value}),
      addEType: () => { if(!S.newEType.trim())return; setS({ empTypes:[...S.empTypes, S.newEType], newEType:'' }); this.toast('Employment type added'); },
      empNew: () => setS({ empForm:'new', empId:null, eType:S.empTypes[0], eName:'', eMobile:'', eAadhaar:'', ePan:'', eAddr:'', eAlt:'', eDesig:'', eDocs:[], ePhoto:false }),
      eDocSlots: [['Aadhaar card','Aadhaar_card.pdf'],['PAN card','PAN_card.pdf']].map(sl => {
        const found = (S.eDocs||[]).find(d => d.kind === sl[0]);
        return { kind: sl[0], has: !!found, hasNot: !found, name: found ? found.n : '', size: found ? found.s : '',
          tagStyle: { font:"800 8.5px 'Public Sans',sans-serif", color:'#fff', background: found?'#B23334':'#C0C5DC', borderRadius:'5px', padding:'4px 6px', letterSpacing:'.05em', flexShrink:0 },
          attach: () => setS({ eDocs: [...(S.eDocs||[]).filter(d=>d.kind!==sl[0]), { kind:sl[0], n:sl[1], s:'740 KB' }] }),
          remove: () => setS({ eDocs: (S.eDocs||[]).filter(d => d.kind !== sl[0]) }),
          style: { display:'flex', alignItems:'center', gap:'10px', background: found?'#F7F9FD':'#FAFBFE', border:'1px '+(found?'solid #E9EDF6':'dashed #C6CFE8'), borderRadius:'10px', padding:'11px 12px' } };
      }),
      eDesigOpts: [{o:'Select designation…'}].concat(S.designations.map(o=>({o}))), eDesigSel: S.eDesig || 'Select designation…',
      eDesigChange:(e)=>setS({eDesig: e.target.value==='Select designation…' ? '' : e.target.value}),
      desigChips: S.designations.map((d,i)=>({ label:d, del:()=>setS({ designations:S.designations.filter((_,xi)=>xi!==i) }) })),
      newDesig:S.newDesig, newDesigChange:(e)=>setS({newDesig:e.target.value}),
      addDesig: () => { if(!S.newDesig.trim())return; setS({ designations:[...S.designations, S.newDesig], newDesig:'' }); this.toast('Designation added'); },
      empFormOpen: !!S.empForm, empFormTitle: S.empForm==='edit' ? 'Edit employee' : 'New employee',
      empFormCta: S.empForm==='edit' ? 'Save changes' : 'Create employee',
      empClose: () => setS({ empForm:null }),
      eTypeOpts: S.empTypes.map(o=>({o})), eTypeSel: S.eType, eTypeChange:(e)=>setS({eType:e.target.value}),
      eName:S.eName, eNameChange:(e)=>setS({eName:e.target.value}),
      eCCOpts: CCODES.map(c=>({c})), eCCChange:(e)=>setS({eCC:e.target.value.split(' ')[0]}),
      eMobile:S.eMobile, eMobileChange:(e)=>setS({eMobile:e.target.value.replace(/[^\d\s]/g,'')}),
      eAadhaar:S.eAadhaar, eAadhaarChange:(e)=>setS({eAadhaar:e.target.value.replace(/[^\d\s]/g,'')}),
      ePan:S.ePan, ePanChange:(e)=>setS({ePan:e.target.value.toUpperCase()}),
      eAddr:S.eAddr, eAddrChange:(e)=>setS({eAddr:e.target.value}),
      eAlt:S.eAlt, eAltChange:(e)=>setS({eAlt:e.target.value.replace(/[^\d\s+]/g,'')}),
      ePhoto:S.ePhoto, ePhotoPick: () => setS({ ePhoto:true }),
      ePhotoStyle: { width:'84px', height:'84px', borderRadius:'12px', border:'1.5px '+(S.ePhoto?'solid #77C39A':'dashed #C6CFE8'), background:S.ePhoto?'#E4F6EC':'#FAFBFE', color:S.ePhoto?'#177049':'#9BA1C2', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', cursor:'pointer', font:"600 10px 'Public Sans',sans-serif", flexShrink:0 },
      ePhotoTxt: S.ePhoto ? '✓ Photo added' : 'Upload photo',
      empSave: () => {
        if (!S.eName.trim() || !S.eMobile.trim() || !S.eAadhaar.trim() || !S.ePhoto) { this.toast('Name, mobile, photo and Aadhaar are mandatory'); return; }
        const rec = { type:S.eType, name:S.eName, mobile:S.eCC+' '+S.eMobile, aadhaar:S.eAadhaar, pan:S.ePan||'—', addr:S.eAddr||'—', alt:S.eAlt||'—', desig:S.eDesig||'—', skill:S.eDesig||'—', docs:S.eDocs||[] };
        if (S.empForm==='edit') { setS({ employees:S.employees.map(x=>x.id===S.empId?{...x,...rec}:x), empForm:null }); this.toast(S.eName + ' updated'); }
        else { const id = Math.max(0,...S.employees.map(x=>x.id))+1; setS({ employees:[...S.employees, {id,...rec}], empForm:null }); this.toast(S.eName + ' added to the user master'); }
      },
      attDate:S.attDate, attDateChange:(e)=>setS({attDate:e.target.value}),
      attRows, attSummary, attSave: () => this.toast(markedToday + ' of ' + S.employees.length + ' marked for ' + fuFmt(S.attDate)),
      attAllPresent: () => { const nx={...S.att}; S.employees.forEach(e=>{ nx[attKey(e.id)] = { ...(nx[attKey(e.id)]||{}), st:'P' }; }); setS({att:nx}); this.toast('All marked Present — adjust exceptions below'); },
      rpFrom:S.rpFrom, rpFromChange:(e)=>setS({rpFrom:e.target.value}),
      rpTo:S.rpTo, rpToChange:(e)=>setS({rpTo:e.target.value}),
      rpRows, rpDays: dates.length + (dates.length===1?' day':' days') + ' · ' + fuFmt(S.rpFrom) + ' → ' + fuFmt(S.rpTo),
      rpTotP:String(rpTot.p), rpTotA:String(rpTot.a), rpTotH:String(rpTot.h), rpTotPay:rpTot.pay.toFixed(1),
      rpExport: () => this.toast('Attendance report exported — attendance_' + S.rpFrom + '_to_' + S.rpTo + '.xlsx'),
      isKB: S.screen==='kb' && S.kbView==null, isKBDetail: S.screen==='kb' && S.kbView!=null,
      kbSearch: S.kbSearch, kbSearchChange:(e)=>setS({kbSearch:e.target.value}),
      kbCards, kbDetail, kbEmpty: kbCards.length===0,
      kbCount: kbFiltered.length + ' of ' + S.kbArticles.length + ' articles',
      kbBack: () => setS({ kbView:null }),
      kbNew: () => setS({ kbForm:'new', kbName:'', kbDesc:'', kbFiles:[], kbId:null }),
      kbFormOpen: !!S.kbForm, kbFormTitle: S.kbForm==='edit' ? 'Edit article' : 'New article',
      kbFormCta: S.kbForm==='edit' ? 'Save changes' : 'Publish article',
      kbCloseForm: () => setS({ kbForm:null }),
      kbName: S.kbName, kbNameChange:(e)=>setS({kbName:e.target.value}),
      kbDesc: S.kbDesc, kbDescChange:(e)=>setS({kbDesc:e.target.value}),
      kbEditorRef: (el) => { this._kbEd = el; if (el && el.innerHTML !== (S.kbDesc||'') && document.activeElement !== el) el.innerHTML = S.kbDesc || ''; },
      kbEdInput: () => { if (this._kbEd) this.setState({ kbDesc: this._kbEd.innerHTML }); },
      kbTools: [
        { cmd:'bold', label:'B', st:{ fontWeight:800 } }, { cmd:'italic', label:'I', st:{ fontStyle:'italic' } },
        { cmd:'underline', label:'U', st:{ textDecoration:'underline' } },
        { cmd:'insertUnorderedList', label:'• List', st:{} }, { cmd:'insertOrderedList', label:'1. List', st:{} },
        { cmd:'formatBlock:h3', label:'H', st:{ fontWeight:800 } }, { cmd:'createLink', label:'🔗', st:{} },
        { cmd:'removeFormat', label:'⌫ Clear', st:{} }
      ].map(t => ({ label:t.label,
        style: { border:'1px solid #E3E7F2', background:'#fff', color:'#3A3F5C', borderRadius:'7px', padding:'6px 10px', cursor:'pointer', font:"600 11.5px 'Public Sans',sans-serif", minWidth:'30px', ...t.st },
        run: (e) => { e.preventDefault();
          if (this._kbEd) this._kbEd.focus();
          if (t.cmd === 'createLink') { const u = window.prompt('Link URL', 'https://'); if (u) document.execCommand('createLink', false, u); }
          else if (t.cmd.startsWith('formatBlock')) document.execCommand('formatBlock', false, t.cmd.split(':')[1]);
          else document.execCommand(t.cmd, false, null);
          if (this._kbEd) this.setState({ kbDesc: this._kbEd.innerHTML }); } })),
      kbFormFiles: (S.kbFiles||[]).map((f,i) => ({ ...mkFile(f), remove: () => setS({ kbFiles: S.kbFiles.filter((_,xi)=>xi!==i) }) })),
      kbAddFile: () => { const n = ['Reference_notes.pdf','Floor_plans.zip','Rate_card.xlsx','Process_flow.docx'][ (S.kbFiles||[]).length % 4 ];
        setS({ kbFiles: [...(S.kbFiles||[]), { n, s:'1.4 MB' }] }); },
      kbNoFiles: (S.kbFiles||[]).length === 0,
      kbSave: () => {
        if (!S.kbName.trim()) { this.toast('Article name is mandatory'); return; }
        if (S.kbForm === 'edit') {
          setS({ kbArticles: S.kbArticles.map(a => a.id===S.kbId ? { ...a, name:S.kbName, desc:S.kbDesc, files:S.kbFiles, by:S.role, at:now() } : a), kbForm:null });
          this.toast('"'+S.kbName+'" updated');
        } else {
          const id = Math.max(0, ...S.kbArticles.map(a=>a.id)) + 1;
          setS({ kbArticles: [{ id, name:S.kbName, desc:S.kbDesc, files:S.kbFiles, by:S.role, at:now() }, ...S.kbArticles], kbForm:null });
          this.toast('"'+S.kbName+'" published to the knowledge base');
        }
      },
      fuShown: fuList.length + ' shown',
      fuViewChips: [['grid','▦'],['list','☰'],['cal','▤']].map(v => ({ label:v[1], pick:()=>setS({fuView:v[0]}),
        style:{ border:'1px solid '+(S.fuView===v[0]?'#0089C9':'#E3E7F2'), background:S.fuView===v[0]?'#E3F2FC':'#fff', color:S.fuView===v[0]?'#0672A6':'#7A80A3', font:"700 13px 'Public Sans',sans-serif", borderRadius:'8px', padding:'8px 14px', cursor:'pointer' } })),
      fuIsGrid: S.fuView==='grid', fuIsList: S.fuView==='list', fuIsCal: S.fuView==='cal',
      fuSearch: S.fuSearch, fuSearchChange:(e)=>setS({fuSearch:e.target.value}),
      fuTypeOpts: ['All types','Call','Site Visit Scheduled'].map(o=>({o})), fuTypeSel: S.fuFType, fuTypeFChange:(e)=>setS({fuFType:e.target.value}),
      fuBuckets, fuRows, calCells,
      calLabel: MONTHS[calM] + ' ' + calY,
      calPrev: () => setS({ fuMonth: Math.max(0, calM-1) }), calNext: () => setS({ fuMonth: Math.min(11, calM+1) }),
      dowHeads: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>({d})),
      fuGoLeads: () => setS({ screen:'leads', selLead:null }),
      kpis, queue, queueCount: queue.length, queueEmpty: queue.length===0, progress, stockAlerts, funnel, health,
      projects, isProjectList: S.screen==='projects' && S.selProj==null, hasSel: S.screen==='projects' && S.selProj != null,
      sp, spStatusStyle: stChip(spRaw.status), closeProj: () => setS({ selProj: null, projTab: 'overview' }),
      projTabs: [['overview','Overview'],['wbs','Work Breakdown'],['team','Team Mapping'],['docs','Documents'],['log','Site Progress']].map(t => ({
        label: t[1], pick: () => setS({ projTab: t[0] }),
        style: { border:'none', borderBottom:'2.5px solid '+(S.projTab===t[0]?'#0089C9':'transparent'), background:'transparent', color:S.projTab===t[0]?'#191A5C':'#7A80A3', font:`${S.projTab===t[0]?'700':'600'} 13px 'Public Sans',sans-serif`, padding:'11px 4px', cursor:'pointer' }
      })),
      pvOverview: S.projTab==='overview', pvWbs: S.projTab==='wbs', pvTeam: S.projTab==='team', pvDocs: S.projTab==='docs', pvLog: S.projTab==='log',
      projSummary: portfolio.n + (portfolio.n === 1 ? ' project' : ' projects') + ' · ' + portfolio.sub + ' under management',
      newProj: S.newProj,
      openNew: () => setS({ newProj: true, npEdit: false, npType: 'Apartment',
        npDraft: { name:'', code:'PRJ-00' + (PDATA.length + 1), location:'', land:'', rera:'', appr:'', towers:'', floors:'', units:'', start:'', end:'' },
        npWbsRows: [] }),
      openEdit: () => setS({ newProj: true, npEdit: true, npType: spRaw.type,
        npDraft: { name:spRaw.name, code:spRaw.code, location:spRaw.location, land:spEx.land||'', rera:spRaw.rera,
          appr:spEx.appr||'', towers:(spRaw.scale.split('·')[0]||'').replace(/[^0-9]/g,''),
          floors:(spEx.fl||'').replace(/[^0-9]/g,''), units:(spRaw.scale.split('·').pop()||'').replace(/[^0-9]/g,''),
          start:spEx.start||'', end:spEx.end||'' },
        npWbsRows: spRaw.wbs.map(w => ({ tag:w.tag, name:w.name, pct:w.pct })) }),
      closeNew: () => setS({ newProj: false, npDraft: null, npWbsRows: null }),
      npTitle: S.npEdit ? 'Edit project' : 'Create project',
      npCta: S.npEdit ? 'Save changes' : 'Create project',
      npFields: [['name','Project name','e.g. NN Lakefront',2],['code','Project code','PRJ-005',1],
        ['location','Location','Area, city',2],['land','Land area','4.2 acres',1],
        ['rera','RERA registration no.','PRM/KA/RERA/…',2],['appr','Approval details','plan sanction ref.',1],
        ['towers','Towers / blocks','2',1],['floors','Floors per tower','18',1],['units','Total units','456',1],
        ['start','Planned start','01 Apr 2027',1],['end','Target completion','31 Dec 2029',1]].map(f => ({
        k: f[1], ph: f[2], req: f[0] === 'name' || f[0] === 'code',
        val: (ND[f[0]] != null ? ND[f[0]] : ''),
        change: (e) => { const v = e.target.value; this.setState(st => ({ npDraft: { ...st.npDraft, [f[0]]: v } })); },
        style: { gridColumn: 'span ' + f[3] } })),
      npTypes: ['Apartment','Villa','Plot','Commercial'].map(t => ({ label:t, pick: () => setS({ npType: t }),
        style: { border:'1px solid ' + (S.npType===t ? '#0089C9' : '#E3E7F2'), background: S.npType===t ? '#E3F2FC' : '#fff',
          color: S.npType===t ? '#0672A6' : '#5A6080', font:"600 12px 'Public Sans',sans-serif", borderRadius:'99px', padding:'8px 14px', cursor:'pointer' } })),
      npWbs: (S.npWbsRows || []).map((w, i) => ({ ...w,
        tagStyle: {...this.pill(tagC[w.tag][0], tagC[w.tag][1]), fontSize:'9px', letterSpacing:'.07em'},
        style: { display:'flex', alignItems:'center', gap:'10px', padding:'9px 12px', marginLeft:(w.tag==='WP'?22:0)+'px',
          background: w.tag==='PHASE' ? '#EFF3FB' : '#F7F9FD', border:'1px solid #E9EDF6', borderRadius:'10px', marginBottom:'6px' },
        edit: () => setS({ wbsForm: { mode:'draft', idx:i, tag:w.tag, name:w.name, pct:String(w.pct||0) } }),
        del: () => this.setState(st => ({ npWbsRows: st.npWbsRows.filter((_,x) => x !== i) })) })),
      npWbsEmpty: (S.npWbsRows || []).length === 0,
      npAddPhase: () => setS({ wbsForm: { mode:'draft', idx:-1, tag:'PHASE', name:'', pct:'0' } }),
      npAddWp: () => setS({ wbsForm: { mode:'draft', idx:-1, tag:'WP', name:'', pct:'0' } }),
      saveNew: () => {
        const d = ND;
        if (!d.name || !d.code) { this.toast('Project name and project code are required'); return; }
        const scale = (d.towers ? d.towers + ' towers' : '1 tower') + ' · ' + (d.floors ? d.floors + ' fl' : '—') + ' · ' + (d.units ? d.units + ' units' : '—');
        const ex = { land:d.land || '—', fl: d.floors ? d.floors + ' floors' : '—', start:d.start || '—', end:d.end || '—', appr:d.appr || '—' };
        const rows = S.npWbsRows || [];
        if (S.npEdit) {
          projWrite(PDATA.map((p, i) => i !== (S.selProj || 0) ? p : { ...p, name:d.name, code:d.code, location:d.location,
            type:S.npType, rera:d.rera, scale, ex, wbs: rows.length ? rows : p.wbs }));
          setS({ newProj:false, npDraft:null, npWbsRows:null });
          this.toast('Project details updated — change logged');
        } else {
          projWrite([...PDATA, { name:d.name, code:d.code, location:d.location, type:S.npType, rera:d.rera, scale, ex,
            pm:'— unassigned', pct:0, spend:'₹0', budget:'₹0', status:'Planned',
            wbs: rows.length ? rows : [{ tag:'PHASE', name:d.name + ' — Structure', pct:0 }],
            team:[], docs:'0', photos:'0' }]);
          setS({ newProj:false, npDraft:null, npWbsRows:null });
          this.toast('Project "' + d.name + '" created as Planned — team mapping next');
        }
      },
      // WBS add/edit form
      wbsOpen: !!S.wbsForm,
      wbsF: (() => { const f = S.wbsForm; if (!f) return {};
        return { title: (f.idx < 0 ? 'Add ' : 'Edit ') + (f.tag === 'PHASE' ? 'phase' : 'work package'),
          name: f.name, nameChange: (e) => { const v = e.target.value; this.setState(st => ({ wbsForm: { ...st.wbsForm, name: v } })); },
          pct: f.pct, pctChange: (e) => { const v = e.target.value; this.setState(st => ({ wbsForm: { ...st.wbsForm, pct: v } })); },
          isPhase: f.tag === 'PHASE',
          tags: [['PHASE','Phase'],['WP','Work package']].map(t => ({ label:t[1], pick: () => this.setState(st => ({ wbsForm: { ...st.wbsForm, tag:t[0] } })),
            style: { border:'1px solid ' + (f.tag===t[0] ? '#0089C9' : '#E3E7F2'), background: f.tag===t[0] ? '#E3F2FC' : '#fff',
              color: f.tag===t[0] ? '#0672A6' : '#5A6080', font:"600 11.5px 'Public Sans',sans-serif", borderRadius:'99px', padding:'7px 13px', cursor:'pointer' } })),
          cancel: () => setS({ wbsForm: null }),
          save: () => { if (!f.name) { this.toast('Name is required'); return; }
            const row = { tag:f.tag, name:f.name, pct: parseInt(f.pct)||0 };
            if (f.mode === 'draft') {
              this.setState(st => ({ npWbsRows: f.idx < 0 ? [...(st.npWbsRows||[]), row] : (st.npWbsRows||[]).map((x,i) => i===f.idx ? row : x), wbsForm: null }));
            } else {
              projWrite(PDATA.map((p, i) => i !== (S.selProj || 0) ? p : { ...p,
                wbs: f.idx < 0 ? [...p.wbs, row] : p.wbs.map((x, xi) => xi === f.idx ? row : x) }));
              setS({ wbsForm: null });
            }
            this.toast((f.tag === 'PHASE' ? 'Phase' : 'Work package') + ' "' + f.name + '" ' + (f.idx < 0 ? 'added' : 'updated')); } }; })(),
      spAddPhase: () => setS({ wbsForm: { mode:'live', idx:-1, tag:'PHASE', name:'', pct:'0' } }),
      spAddWp: () => setS({ wbsForm: { mode:'live', idx:-1, tag:'WP', name:'', pct:'0' } }),
      // documents
      docUpload: () => setS({ docForm: { mode:'new', name:'', tag:'DRAWING', acc:'PM · Supervisor', ver:'v1' } }),
      docOpen: !!S.docForm,
      docF: (() => { const f = S.docForm; if (!f) return { tags: [], accs: [] };
        return { title: f.mode === 'new' ? 'Upload document' : f.mode === 'ver' ? 'Upload new version' : 'Edit document',
          isVer: f.mode === 'ver', isNew: f.mode === 'new', cta: f.mode === 'edit' ? 'Save changes' : '↑ Upload',
          name: f.name, nameChange: (e) => { const v = e.target.value; this.setState(st => ({ docForm: { ...st.docForm, name: v } })); },
          ver: f.ver, verChange: (e) => { const v = e.target.value; this.setState(st => ({ docForm: { ...st.docForm, ver: v } })); },
          picked: f.file || '', hasFile: !!f.file,
          pickFile: () => this.setState(st => ({ docForm: { ...st.docForm, file: (st.docForm.name || 'document').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,28) + '.pdf' } })),
          tags: Object.keys(DTAGC).map(t => ({ label:t, pick: () => this.setState(st => ({ docForm: { ...st.docForm, tag:t } })),
            style: { border:'1px solid ' + (f.tag===t ? '#0089C9' : '#E3E7F2'), background: f.tag===t ? '#E3F2FC' : '#fff',
              color: f.tag===t ? '#0672A6' : '#5A6080', font:"700 10px 'Public Sans',sans-serif", letterSpacing:'.06em', borderRadius:'99px', padding:'6px 11px', cursor:'pointer' } })),
          accs: ['Owner only','Owner · PM','PM · Supervisor','PM · Engineers','All roles · view'].map(a => ({ label:a, pick: () => this.setState(st => ({ docForm: { ...st.docForm, acc:a } })),
            style: { border:'1px solid ' + (f.acc===a ? '#0089C9' : '#E3E7F2'), background: f.acc===a ? '#E3F2FC' : '#fff',
              color: f.acc===a ? '#0672A6' : '#5A6080', font:"600 11px 'Public Sans',sans-serif", borderRadius:'99px', padding:'6px 12px', cursor:'pointer' } })),
          cancel: () => setS({ docForm: null }),
          save: () => { if (!f.name) { this.toast('Document name is required'); return; }
            if (f.mode === 'new') {
              docWrite([{ id:'DOC-' + Date.now().toString().slice(-6), name:f.name, tag:f.tag, acc:f.acc, proj: spRaw.name,
                meta: (f.ver || 'v1') + ' · uploaded ' + fmtD(TODAY) + ' · ' + S.role }, ...docsAll]);
              this.toast('"' + f.name + '" uploaded to the repository');
            } else if (f.mode === 'ver') {
              const cur = parseInt((String(f.ref.meta).match(/^v(\d+)/)||[0,1])[1]) || 1;
              docWrite(docsAll.map(x => x.id !== f.ref.id ? x : { ...x, name:f.name, tag:f.tag, acc:f.acc,
                meta: 'v' + (cur + 1) + ' · uploaded ' + fmtD(TODAY) + ' · ' + S.role }));
              this.toast('New version of "' + f.name + '" uploaded — earlier versions kept');
            } else {
              docWrite(docsAll.map(x => x.id !== f.ref.id ? x : { ...x, name:f.name, tag:f.tag, acc:f.acc }));
              this.toast('"' + f.name + '" updated');
            }
            setS({ docForm: null }); } }; })(),
      taskChips, tasks, clRuns,
      tEmpty: tasks.length === 0,
      tEmptyMsg: (S.taskList && S.taskList.length) ? 'No tasks match this filter — clear the filter or create one with + New task' : 'No tasks yet — create one with + New task',
      tSelCount: (S.taskSel||[]).length + ' selected',
      tHasSel: (S.taskSel||[]).length > 0,
      tAllOn: tasks.length > 0 && tasks.every(t => (S.taskSel||[]).includes(t.id)),
      tAllBox: (() => { const on = tasks.length > 0 && tasks.every(t => (S.taskSel||[]).includes(t.id));
        const some = !on && tasks.some(t => (S.taskSel||[]).includes(t.id));
        return { mark: on ? '✓' : some ? '–' : '',
          style: { width:'16px', height:'16px', borderRadius:'4px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            border:'1.5px solid ' + (on || some ? '#0089C9' : '#C6CFE8'), background: on || some ? '#0089C9' : '#fff',
            font:"800 10px 'Public Sans',sans-serif", color:'#fff', padding:0 },
          toggle: () => setS({ taskSel: on ? [] : tasks.map(t => t.id) }) }; })(),
      tClearSel: () => setS({ taskSel: [] }),
      tBulk: [['advance','Advance stage'],['high','Set priority High'],['reassign','Reassign…'],['delete','Delete']].map(b => ({
        label: b[1], danger: b[0] === 'delete',
        style: { border:'1px solid ' + (b[0] === 'delete' ? '#F2CBCB' : '#BFD9F2'), background: b[0] === 'delete' ? '#FCEDED' : '#fff',
          color: b[0] === 'delete' ? '#B23334' : '#0672A6', font:"700 11.5px 'Public Sans',sans-serif", borderRadius:'8px', padding:'8px 13px', cursor:'pointer' },
        run: () => { const ids = S.taskSel || []; if (!ids.length) return;
          if (b[0] === 'advance') { taskWrite(TLIVE.map(x => !ids.includes(x.id) ? x : { ...x, status: x.status === 'Approved' ? 'Reopened' : TFLOW[x.status], od: false }));
            this.toast(ids.length + ' task' + (ids.length===1?'':'s') + ' advanced to the next stage'); setS({ taskSel: [] }); return; }
          if (b[0] === 'high') { taskWrite(TLIVE.map(x => !ids.includes(x.id) ? x : { ...x, pri:'High' }));
            this.toast(ids.length + ' task' + (ids.length===1?'':'s') + ' set to High priority'); setS({ taskSel: [] }); return; }
          if (b[0] === 'reassign') { setS({ taskBulkAssign: true }); return; }
          setS({ confirmDel: { what: ids.length === 1 ? 'task' : 'tasks', name: ids.length + ' selected task' + (ids.length===1?'':'s'),
            run: () => { taskWrite(TLIVE.filter(x => !ids.includes(x.id))); setS({ taskSel: [] });
              this.toast(ids.length + ' task' + (ids.length===1?'':'s') + ' deleted'); } } }); } })),
      tBulkAssignOpen: !!S.taskBulkAssign,
      tBulkAssignees: ['R. Manjunath','S. Kumar','M. Iqbal','V. Sharma','D. Shetty'].map(w => ({ label:w,
        pick: () => { const ids = S.taskSel || [];
          taskWrite(TLIVE.map(x => !ids.includes(x.id) ? x : { ...x, who: w }));
          setS({ taskBulkAssign: false, taskSel: [] });
          this.toast(ids.length + ' task' + (ids.length===1?'':'s') + ' reassigned to ' + w); } })),
      tBulkAssignClose: () => setS({ taskBulkAssign: false }),
      taskNew: () => setS({ taskForm: { mode:'new', title:'', proj:'', loc:'', who:'', due:'', pri:'Medium' } }),
      taskOpen: !!S.taskForm,
      taskF: (() => { const f = S.taskForm; if (!f) return { pris: [], whos: [] };
        const fld = (k) => ({ val: f[k] || '', change: (e) => { const v = e.target.value; this.setState(st => ({ taskForm: { ...st.taskForm, [k]: v } })); } });
        return { title: f.mode === 'new' ? 'New task' : 'Edit task', cta: f.mode === 'new' ? 'Create task' : 'Save changes',
          t: fld('title'), loc: fld('loc'), due: fld('due'),
          projs: [{ label:'— no project —', val:'' }].concat(PDATA.map(p => ({ label:p.name, val:p.name }))).map(p => ({
            label: p.label, pick: () => this.setState(st => ({ taskForm: { ...st.taskForm, proj: p.val } })),
            style: { border:'1px solid ' + ((f.proj||'') === p.val ? '#0089C9' : '#E3E7F2'), background: (f.proj||'') === p.val ? '#E3F2FC' : '#fff',
              color: (f.proj||'') === p.val ? '#0672A6' : '#5A6080', font:"600 11.5px 'Public Sans',sans-serif", borderRadius:'99px', padding:'7px 13px', cursor:'pointer' } })),
          who: f.who,
          whos: ['R. Manjunath','S. Kumar','M. Iqbal','V. Sharma','D. Shetty'].map(w => ({ label:w, pick: () => this.setState(st => ({ taskForm: { ...st.taskForm, who:w } })),
            style: { border:'1px solid ' + (f.who===w ? '#0089C9' : '#E3E7F2'), background: f.who===w ? '#E3F2FC' : '#fff',
              color: f.who===w ? '#0672A6' : '#5A6080', font:"600 11.5px 'Public Sans',sans-serif", borderRadius:'99px', padding:'7px 13px', cursor:'pointer' } })),
          pris: ['High','Medium','Low'].map(p => ({ label:p, pick: () => this.setState(st => ({ taskForm: { ...st.taskForm, pri:p } })),
            style: { border:'1px solid ' + (f.pri===p ? '#0089C9' : '#E3E7F2'), background: f.pri===p ? '#E3F2FC' : '#fff',
              color: f.pri===p ? '#0672A6' : '#5A6080', font:"600 11.5px 'Public Sans',sans-serif", borderRadius:'99px', padding:'7px 13px', cursor:'pointer' } })),
          cancel: () => setS({ taskForm: null }),
          save: () => { if (!f.title || !f.who) { this.toast('Task title and assignee are required'); return; }
            if (f.mode === 'new') {
              const maxN = TLIVE.reduce((m,x) => Math.max(m, parseInt(String(x.id).replace(/\D/g,'')) || 0), 1050);
              const id = 'T-' + (maxN + 1);
              const locTxt = [f.proj, f.loc].filter(Boolean).join(' · ') || '—';
              taskWrite([{ id, title:f.title, proj:f.proj || '', loc: locTxt, who:f.who, due:f.due || fmtD(TODAY).slice(0,6),
                pri:f.pri, status:'Open', ev:'—', od:false }, ...TLIVE]);
              this.toast('Task ' + id + ' created and assigned to ' + f.who);
            } else {
              taskWrite(TLIVE.map(x => x.id !== f.ref.id ? x : { ...x, title:f.title, proj:f.proj || '',
                loc: [f.proj, f.loc].filter(Boolean).join(' · ') || '—', who:f.who, due:f.due, pri:f.pri }));
              this.toast(f.ref.id + ' updated');
            }
            setS({ taskForm: null }); } }; })(),
      ptIndents: S.screen==='indents', ptPOs: S.screen==='pos', ptGRN: S.screen==='grn',
      indents, pos, grns, stock, moves, pipeline,
      itBuildOpen: !!S.itBuild, itListOpen: !S.itBuild && !S.itView,
      itTitle: S.itBuild === 'edit' ? 'Edit item' : 'New item master record',
      itCode: S.itBuild === 'edit' ? (ITD.code || '—') : nextCode(),
      itFields: fieldRow(ITF, ITD, iPatch),
      itSave, itSaveLabel: S.itBuild === 'edit' ? 'Save item' : 'Create item',
      itCancel: () => setS({ itBuild:null, itDraft:null }),
      itViewOpen: !!S.itView,
      itVD: (() => { const o = S.itView; if (!o) return { rows: [] }; const st = parseFloat(o.stock)||0, rl = parseFloat(o.reorder)||0;
        const low = st < rl, near = !low && st < rl * 1.25;
        return { init: (o.name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(), name:o.name, code:o.code, unit:o.unit, stock:o.stock, reorder:o.reorder, spec:o.spec || 'No specification recorded',
          stockTxt: o.stock + ' ' + o.unit, reorderTxt: o.reorder + ' ' + o.unit,
          gap: low ? Math.round((rl - st) * 100) / 100 + ' ' + o.unit + ' below reorder level' : near ? 'Approaching reorder level' : 'Comfortable stock',
          flag: low ? 'RESTOCK NOW' : near ? 'ORDER SOON' : 'HEALTHY',
          flagStyle: { display:'inline-flex', font:"800 9px 'Public Sans',sans-serif", letterSpacing:'.08em', color:'#fff', borderRadius:'99px', padding:'5px 10px',
            background: low ? '#D8494A' : near ? '#E8A13A' : '#1F9D66' },
          barOuter: { height:'9px', background:'#EEF1F8', borderRadius:'99px', overflow:'hidden', marginTop:'10px' },
          barInner: { height:'100%', width: Math.min(100, Math.round(st / Math.max(rl*1.5, 1) * 100)) + '%', borderRadius:'99px',
            background: low ? 'linear-gradient(90deg,#D8494A,#E8827F)' : near ? 'linear-gradient(90deg,#E8A13A,#F2C063)' : 'linear-gradient(90deg,#1F9D66,#5BC8A2)' },
          hist: (() => {
            const all = ledgerOf(o.code);
            const TC = { RECEIPT:['#177049','#E4F6EC','▼ RECEIVED'], ISSUE:['#B23334','#FCEDED','▲ ISSUED'],
              RETURN:['#0672A6','#E3F2FC','↩ RETURNED'], TRANSFER:['#6A46C8','#EFE9FC','⇄ TRANSFER'] };
            const shown = S.itHTab === 'all' ? all : all.filter(x => x.type === S.itHTab);
            let run = 0; const signed = all.map(x => ({ ...x, sign: x.type==='ISSUE'||x.type==='TRANSFER' ? -1 : 1 }));
            const inQty = signed.filter(x=>x.sign>0).reduce((s,x)=>s+x.qty,0);
            const outQty = signed.filter(x=>x.sign<0).reduce((s,x)=>s+x.qty,0);
            return { rows: shown.map(x => ({ ...x,
                tag: TC[x.type][2], tagStyle: {...this.pill(TC[x.type][0], TC[x.type][1]), fontSize:'9px', letterSpacing:'.07em'},
                qtyTxt: (x.type==='ISSUE'||x.type==='TRANSFER' ? '−' : '+') + x.qty + ' ' + o.unit,
                qtyStyle: { font:"800 13.5px 'Sora',sans-serif", color: TC[x.type][0] },
                note: x.note || '—', ref: x.ref || '—' })),
              empty: shown.length === 0, count: all.length + (all.length===1?' transaction':' transactions'),
              inTxt: '+' + Math.round(inQty*100)/100 + ' ' + o.unit, outTxt: '−' + Math.round(outQty*100)/100 + ' ' + o.unit,
              tabs: [['all','All'],['RECEIPT','Received'],['ISSUE','Issued'],['RETURN','Returned'],['TRANSFER','Transfers']].map(t => ({
                label: t[1], pick: () => setS({ itHTab: t[0] }),
                style: { border:'1px solid ' + (S.itHTab===t[0] ? '#0089C9' : '#E3E7F2'), background: S.itHTab===t[0] ? '#E3F2FC' : '#fff',
                  color: S.itHTab===t[0] ? '#0672A6' : '#5A6080', font:"600 11.5px 'Public Sans',sans-serif",
                  borderRadius:'99px', padding:'7px 13px', cursor:'pointer' } })) }; })(),
          edit: () => setS({ itView:null, itBuild:'edit', itDraft: { name:o.name, code:o.code, unit:o.unit, stock:o.stock, reorder:o.reorder, spec:o.spec } }),
          del: () => setS({ confirmDel: { kind:'item', id:o.code, label:o.name } }),
          toIndent: () => setS({ itView:null, screen:'indents', inBuild:'new', inPick:'',
            inDraft: { ref: autoNo('indent'), project:'NN Skyline', activity:'', reqBy:'', remarks:'',
              lines:[{ name:o.name, code:o.code, unit:o.unit, qty:'' }], editing:false } }) }; })(),
      itViewClose: () => setS({ itView: null }),
      vnBuildOpen: !!S.vnBuild, vnListOpen: !S.vnBuild && !S.vnView,
      vnTitle: S.vnBuild === 'edit' ? 'Edit vendor' : 'New vendor',
      vnCode: S.vnBuild === 'edit' ? (VND.code || '—') : autoNo('vendor'),
      vnFields: fieldRow(VNF, VND, vPatch),
      vnCatChips: (S.vCats||[]).map(c => { const on = (VND.catList||[]).includes(c);
        return { c, on, toggle: () => vPatch({ catList: on ? (VND.catList||[]).filter(x=>x!==c) : [...(VND.catList||[]), c] }),
          style: { border:'1px solid ' + (on ? '#0089C9' : '#E3E7F2'), background: on ? '#E3F2FC' : '#fff',
            color: on ? '#0672A6' : '#5A6080', font:"600 11.5px 'Public Sans',sans-serif", borderRadius:'99px',
            padding:'7px 13px', cursor:'pointer' }, mark: on ? '✓ ' : '+ ' }; }),
      vnCatCount: (VND.catList||[]).length ? (VND.catList||[]).length + ' selected' : 'None selected',
      newVCat: S.newVCat, newVCatChange: (e) => setS({ newVCat: e.target.value }),
      addVCat: () => { const v = (S.newVCat||'').trim(); if (!v) return;
        if ((S.vCats||[]).includes(v)) { this.toast('"' + v + '" already exists'); return; }
        setS({ vCats: [...(S.vCats||[]), v], vnDraft: { ...VND, catList: [...(VND.catList||[]), v] }, newVCat: '' });
        this.toast('Category "' + v + '" added to the master'); },
      vnSave, vnSaveLabel: S.vnBuild === 'edit' ? 'Save vendor' : 'Create vendor',
      vnCancel: () => setS({ vnBuild:null, vnDraft:null }),
      vnViewOpen: !!S.vnView,
      vnVD: (() => { const o = S.vnView; if (!o) return { rows: [], pos: [] };
        const vpos = PODATA.filter(p => !isGone('po', p.no) && p.vendor === o.name).map(poFill).map(p => ({
          no:p.no, items:p.items, value:p.value, status:p.status, stStyle: {...this.pill(p.st[0], p.st[1]), fontSize:'9.5px'},
          open: () => setS({ vnView:null, screen:'pos', poView:p }) }));
        return { name:o.name, code:o.code, status:o.status,
          init: (o.name||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
          avStyle: { width:'44px', height:'44px', borderRadius:'12px', background:'linear-gradient(140deg,#0089C9,#2F308C)', color:'#fff',
            font:"700 14px 'Public Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
          statusStyle: this.pill(o.status === 'Active' ? '#177049' : '#B4530A', o.status === 'Active' ? '#E4F6EC' : '#FDF3E7'),
          rating:o.rating, ontime:o.ontime, spend:o.spend,
          rows: [ ['Contact person', o.contact], ['Mobile', o.mobile], ['Email', o.email],
                  ['Supply categories', o.cats], ['GSTIN', o.gst], ['PAN', o.pan],
                  ['Payment terms', o.terms],
                  ['Bank account number', o.acct || (o.bank ? String(o.bank).split('·')[0].trim() : '')],
                  ['IFSC code', o.ifsc || (o.bank ? String(o.bank).split('·')[1] : '')],
                  ['Bank & branch', o.bankName], ['UPI ID', o.upi],
                  ['Address', o.addr] ].map(r => ({ k:r[0], v:(r[1] && String(r[1]).trim()) || '—' })),
          pos: vpos, noPOs: vpos.length === 0, poCount: vpos.length + (vpos.length===1?' purchase order':' purchase orders'),
          edit: () => setS({ vnView:null, vnBuild:'edit', vnDraft: { code:o.code, name:o.name, contact:o.contact, mobile:o.mobile, email:o.email, gst:o.gst, pan:o.pan, cats:o.cats, catList: (o.cats||'').split('·').map(c=>c.trim()).filter(Boolean), terms:o.terms, acct:o.acct||'', ifsc:o.ifsc||'', bankName:o.bankName||'', upi:o.upi||'', addr:o.addr } }),
          del: () => setS({ confirmDel: { kind:'vendor', id:o.name, label:o.name } }),
          toPO: () => setS({ vnView:null, screen:'pos', poBuild:'new', poPick:'',
            poDraft: { no: autoNo('po'), remarks:'', indents:[], vendor:o.name, delivery:'', terms:o.terms||'30 days credit · delivery at site', project:'NN Skyline', lines:[], rev:0, editing:false } }) }; })(),
      vnViewClose: () => setS({ vnView: null }),
      prQ: S.prQ, prQChange: (e) => setS({ prQ: e.target.value }),
      prFrom: S.prFrom, prFromChange: (e) => setS({ prFrom: e.target.value }),
      prTo: S.prTo, prToChange: (e) => setS({ prTo: e.target.value }),
      prActive, prClear,
      prHasDate: ['indents','pos','grn'].includes(S.screen),
      prCfg: (() => {
        const A = { indents: ['Project', ['All','NN Skyline','NN Riverview','NN Meadows']],
          pos: ['Vendor', ['All', ...Array.from(new Set(PODATA.map(p=>p.vendor)))]],
          grn: ['Vendor', ['All', ...Array.from(new Set(GRNDATA.map(g=>g.vendor)))]],
          items: ['Unit', ['All', ...(S.uomList||[])]],
          vendors: ['Status', ['All','Active','On hold']] }[S.screen] || ['', ['All']];
        const B = { indents: ['Status', ['All','PM approval','Stock check','Part-issued','PO created','Issued']],
          pos: ['Status', ['All','Pending PM approval','Pending admin approval','Approved · sent to vendor','Partially received','Delivery overdue','Closed · matched']],
          grn: ['Invoice', ['All','Invoice pending','Invoice attached']],
          items: ['Stock', ['All','Restock now','Order soon','Healthy']],
          vendors: ['Category', ['All', ...(S.vCats||[])]] }[S.screen] || ['', ['All']];
        return { aLabel: A[0], aSel: S.prA, aOpts: A[1].map(o=>({o})), aChange: (e)=>setS({ prA:e.target.value }),
          bLabel: B[0], bSel: S.prB, bOpts: B[1].map(o=>({o})), bChange: (e)=>setS({ prB:e.target.value }),
          ph: { indents:'Search indent no., item, project, activity…', pos:'Search PO no., vendor, item, indent…',
            grn:'Search GRN no., PO, vendor, receiver…', items:'Search item name, code, specification…',
            vendors:'Search vendor, contact, mobile, GSTIN…' }[S.screen] || 'Search…',
          count: { indents: indents.length + ' indents', pos: pos.length + ' purchase orders', grn: grns.length + ' receipts',
            items: '', vendors: '' }[S.screen] || '' }; })(),
      cdOpen: !!S.confirmDel,
      cdLabel: (S.confirmDel||{}).label || (S.confirmDel||{}).name || '',
      cdKind: KINDN[(S.confirmDel||{}).kind] || (S.confirmDel||{}).what || 'record',
      cdTitle: (() => { const k = KINDN[(S.confirmDel||{}).kind] || (S.confirmDel||{}).what || 'record';
        return (/s$/.test(k) ? 'Delete these ' : 'Delete this ') + k + '?'; })(),
      cdThis: (() => { const k = KINDN[(S.confirmDel||{}).kind] || (S.confirmDel||{}).what || 'record';
        return (/s$/.test(k) ? 'they ' : 'this ' + k + ' '); })(),
      cdCancel: () => setS({ confirmDel: null }),
      cdConfirm: () => { const c = S.confirmDel; if (!c) return;
        if (typeof c.run === 'function') { c.run(); setS({ confirmDel: null }); return; }
        pcDelNow(c.kind, c.id, c.label); },
      grBuildOpen: !!S.grBuild, grListOpen: !S.grBuild && !S.grView,
      grViewOpen: !!S.grView,
      grVD: (() => { const o = S.grView; if (!o) return { lines: [] };
        const src = PODATA.filter(p => p.no === o.po).map(poFill)[0];
        const ls = (o.lines && o.lines.length ? o.lines : []).map((l,i) => { const sh = Math.max(0, (parseFloat(l.ordered)||0) - (parseFloat(l.recd)||0) - (parseFloat(l.rej)||0));
          return { sl:String(i+1), name:l.name, code:l.code, ordered:(l.ordered||'—')+' '+(l.unit||''),
            recd:(l.recd||'0')+' '+(l.unit||''), rej:(l.rej||'0')+' '+(l.unit||''),
            verdict: sh ? 'Short ' + sh + ' ' + (l.unit||'') : (parseFloat(l.rej)||0) ? 'Received with rejection' : 'Fully received',
            vStyle: this.pill(sh ? '#B4530A' : (parseFloat(l.rej)||0) ? '#B23334' : '#177049', sh ? '#FDF3E7' : (parseFloat(l.rej)||0) ? '#FCEDED' : '#E4F6EC') }; });
        return { no:o.no, po:o.po, vendor:o.vendor, item:o.item, match:o.match,
          matchStyle: this.pill((o.mc||['#5A6080','#F1F4FB'])[0], (o.mc||['#5A6080','#F1F4FB'])[1]),
          receiver: o.receiver || o.insp || '—', receivedAt: o.receivedAt || '—',
          acc:o.acc || '—', rej:o.rej || 'None', short:o.short || 'None',
          remarks: o.remarks || 'No remarks',
          photo: o.photo || '', hasPhoto: !!o.photo,
          invoiceNo: o.invoiceNo || '', hasInvoice: !!o.invoiceNo, noInvoice: !o.invoiceNo,
          poValue: src ? src.value : '—', poDelivery: src ? src.delivery : '—',
          poApproved: src && src.admBy ? src.admBy + ' · ' + src.admAt : '—',
          poIndents: src ? (src.indents && src.indents.length ? src.indents.join(' · ') : (src.indent || '—')) : '—',
          lines: ls, noLines: ls.length === 0, lineCount: ls.length + (ls.length===1?' line':' lines'),
          attachInvoice: () => { const inv = 'INV-2026-' + Math.floor(4000 + Math.random()*900);
            setS({ grnList: GRNDATA.map(x => x.no === o.no ? { ...x, invoiceNo: inv, match:'3-way matched ✓', mc:['#177049','#E4F6EC'] } : x),
              grView: { ...o, invoiceNo: inv, match:'3-way matched ✓', mc:['#177049','#E4F6EC'] } });
            this.toast('Invoice ' + inv + ' attached — 3-way match passed'); },
          edit: () => setS({ grView:null, grBuild:'edit', grDraft: grDraftOf(o), grPick:'' }),
          del: () => setS({ confirmDel: { kind:'grn', id:o.no, label:o.no } }),
          openPO: () => { if (src) setS({ grView:null, screen:'pos', poView: src }); } }; })(),
      grViewClose: () => setS({ grView: null }),
      grNo: GRD.no, grPoSel: GRD.po, grHasPO: !!GRD.po,
      grPick: S.grPick, grPickChange: (e) => setS({ grPick: e.target.value }),
      grPOOpts: poApprovedList()
        .filter(o => { const q = (S.grPick||'').trim().toLowerCase(); return !q || (o.no + ' ' + o.vendor + ' ' + o.items).toLowerCase().includes(q); })
        .map(o => ({ no:o.no, vendor:o.vendor, items:o.items, value:o.value, status:o.status,
          stStyle: {...this.pill(o.st[0], o.st[1]), fontSize:'9.5px'}, pick: grPickPO(o),
          style: { display:'flex', alignItems:'center', gap:'10px', textAlign:'left', width:'100%', cursor:'pointer',
            border:'1px solid ' + (GRD.po === o.no ? '#0089C9' : '#E9EDF6'), background: GRD.po === o.no ? '#E3F2FC' : '#FAFBFE',
            borderRadius:'9px', padding:'10px 12px' } })),
      grNoApproved: poApprovedList().length === 0,
      grPO: (() => { const o = GRD.poRec || (GRD.source ? { no:GRD.source.po, vendor:GRD.source.vendor } : null); if (!o) return {};
        return { no:o.no, vendor:o.vendor, project:o.project||'NN Skyline', value:o.value||'—', delivery:o.delivery||'—',
          terms:o.terms||'—', indent: (o.indents && o.indents.length ? o.indents.join(' · ') : (o.indent||'—')),
          approvedBy: o.admBy || '—', approvedAt: o.admAt || '—' }; })(),
      grLines: GRD.lines.map((l,i) => { const sh = grShort(l);
        const bal = l.balance !== undefined ? grNum(l.balance) : grNum(l.ordered);
        const over = grNum(l.recd) + grNum(l.rej) > bal;
        return { name:l.name, code:l.code, unit:l.unit, ordered: l.ordered + ' ' + (l.unit||''), recd:l.recd, rej:l.rej,
          already: (l.already || '0') + ' ' + (l.unit||''), hasPrior: grNum(l.already) > 0,
          balance: bal + ' ' + (l.unit||''),
          verdict: over ? 'Exceeds pending balance' : !l.recd ? 'Awaiting entry' : sh ? 'Balance ' + sh + ' ' + (l.unit||'') + ' pending' : 'This line complete',
          vStyle: this.pill(over ? '#B23334' : !l.recd ? '#8A90B3' : sh ? '#B4530A' : '#177049',
            over ? '#FCEDED' : !l.recd ? '#F1F4FB' : sh ? '#FDF3E7' : '#E4F6EC'),
          recdChange: (e) => gSet({ lines: GRD.lines.map((x,j)=> j===i ? {...x, recd:e.target.value} : x) }),
          rejChange: (e) => gSet({ lines: GRD.lines.map((x,j)=> j===i ? {...x, rej:e.target.value} : x) }) }; }),
      grTot: (() => { const t = grTotals(); return { ordered: String(t.ordered), recd: String(t.recd),
        pending: String(GRD.lines.reduce((s,l)=>s + (l.balance !== undefined ? grNum(l.balance) : grNum(l.ordered)), 0)),
        rej: String(t.rej), short: String(t.short),
        shortStyle: { font:"800 20px 'Sora',sans-serif", color: t.short ? '#B4530A' : '#177049', marginTop:'3px' },
        rejStyle: { font:"800 20px 'Sora',sans-serif", color: t.rej ? '#B23334' : '#3A3F5C', marginTop:'3px' } }; })(),
      grReceiver: GRD.receiver, grReceiverChange: (e) => gSet({ receiver: e.target.value }),
      grRemarks: GRD.remarks, grRemarksChange: (e) => gSet({ remarks: e.target.value }),
      grPhoto: GRD.photo || '', grHasPhoto: !!GRD.photo,
      grPhotoPick: () => gSet({ photo: 'challan-' + GRD.no.toLowerCase() + '.jpg' }),
      grPhotoClear: () => gSet({ photo: '' }),
      grInvFileLabel: GRD.invoiceFile ? '✓ ' + GRD.invoiceFile + ' attached — tap to replace' : '↑ Attach invoice PDF',
      grInvPick: () => gSet({ invoiceFile: (GRD.invoiceNo || 'invoice').toLowerCase().replace(/[^a-z0-9]+/g,'-') + '.pdf' }),
      grInvLater: GRD.invoiceLater, grInvNow: !GRD.invoiceLater,
      grInvChips: [['later','Upload later'],['now','Attach now']].map(c => ({ label:c[1],
        pick: () => gSet({ invoiceLater: c[0]==='later' }),
        style: { border:'1px solid ' + ((GRD.invoiceLater ? 'later':'now') === c[0] ? '#0089C9' : '#E3E7F2'),
          background: (GRD.invoiceLater ? 'later':'now') === c[0] ? '#E3F2FC' : '#fff',
          color: (GRD.invoiceLater ? 'later':'now') === c[0] ? '#0672A6' : '#5A6080',
          font:"700 11.5px 'Public Sans',sans-serif", borderRadius:'8px', padding:'8px 13px', cursor:'pointer' } })),
      grInvoiceNo: GRD.invoiceNo, grInvoiceNoChange: (e) => gSet({ invoiceNo: e.target.value }),
      grSubmit, grSubmitLabel: GRD.editing ? 'Save goods receipt' : 'Create GRN & receive stock',
      grCancel: () => setS({ grBuild:null, grDraft:null }),
      isBuildOpen: !!S.isBuild,
      isRef: ISD.ref || '', isProject: ISD.project || '', isActivity: ISD.activity || '',
      isTo: ISD.to || '', isToChange: (e) => isSet({ to: e.target.value }),
      isBy: ISD.by || '', isByChange: (e) => isSet({ by: e.target.value }),
      isRemarks: ISD.remarks || '', isRemarksChange: (e) => isSet({ remarks: e.target.value }),
      isLines: (ISD.lines||[]).map((l,i) => { const q = parseFloat(l.qty)||0;
        const cap = Math.min(parseFloat(l.have)||0, parseFloat(l.pending)||0);
        const over = q > cap;
        return { name:l.name, code:l.code, unit:l.unit,
          need: l.need + ' ' + (l.unit||''), have: l.have + ' ' + (l.unit||''),
          done: l.done + ' ' + (l.unit||''), pending: l.pending + ' ' + (l.unit||''), qty:l.qty,
          cap: 'max ' + cap + ' ' + (l.unit||''),
          verdict: over ? 'Over available' : !q ? 'Not issuing' : q >= (parseFloat(l.pending)||0) ? 'Closes this line' : 'Part issue · balance stays open',
          vStyle: this.pill(over ? '#B23334' : !q ? '#8A90B3' : q >= (parseFloat(l.pending)||0) ? '#177049' : '#B4530A',
            over ? '#FCEDED' : !q ? '#F1F4FB' : q >= (parseFloat(l.pending)||0) ? '#E4F6EC' : '#FDF3E7'),
          qtyChange: (e) => isSet({ lines: ISD.lines.map((x,j)=> j===i ? {...x, qty:e.target.value} : x) }),
          max: () => isSet({ lines: ISD.lines.map((x,j)=> j===i ? {...x, qty:String(cap)} : x) }),
          none: () => isSet({ lines: ISD.lines.map((x,j)=> j===i ? {...x, qty:''} : x) }) }; }),
      isTotal: (() => { const t = (ISD.lines||[]).reduce((s,l)=>s+(parseFloat(l.qty)||0),0);
        const c = (ISD.lines||[]).filter(l => (parseFloat(l.qty)||0) > 0).length;
        return { qty: String(Math.round(t*100)/100), lines: c + (c===1?' line':' lines') }; })(),
      isSubmit, isCancel: () => setS({ isBuild:null, isDraft:null }),
      inBuildOpen: !!S.inBuild, inListOpen: !S.inBuild && !S.inView,
      inViewOpen: !!S.inView,
      inVD: (() => { const o = S.inView; if (!o) return { lines: [], chain: [] };
        const raw = (o.lines && o.lines.length ? o.lines : [{ name:o.title, code:'—', unit:'', qty:'' }]);
        const ff = indentFulfil(o);
        const ls = ff.lines.map((l,i) => ({ sl:String(i+1), name:l.name, code:l.code,
            qty: (l.qty||'—') + ' ' + (l.unit||''),
            stock: l.have + ' ' + (l.unit||''),
            issued: l.done + ' ' + (l.unit||''),
            pending: l.pending + ' ' + (l.unit||''),
            verdict: l.pending === 0 ? 'Fulfilled' : l.canIssue ? 'Issue ' + l.canIssue + ' now' + (l.pending > l.canIssue ? ' · PO ' + (l.pending - l.canIssue) : '') : 'Not in stock — PO needed',
            vStyle: this.pill(l.pending === 0 ? '#177049' : l.canIssue ? '#0672A6' : '#B4530A',
              l.pending === 0 ? '#E4F6EC' : l.canIssue ? '#E3F2FC' : '#FDF3E7') }));
        const ownCodes = ff.lines.map(l => l.code);
        const hist = ISSUES.filter(x => x.ref === o.ref && ownCodes.includes(x.code)).map(x => ({
          tag: x.type === 'RETURN' ? '↩ RETURNED' : x.type === 'TRANSFER' ? '⇄ TRANSFER' : '▲ ISSUED',
          tagStyle: {...this.pill(x.type === 'RETURN' ? '#0672A6' : x.type === 'TRANSFER' ? '#6A46C8' : '#B23334',
            x.type === 'RETURN' ? '#E3F2FC' : x.type === 'TRANSFER' ? '#EFE9FC' : '#FCEDED'), fontSize:'9px', letterSpacing:'.07em'},
          item: (items.find(i => i.code === x.code)||{}).name || x.code,
          qty: (x.type === 'RETURN' ? '+' : '−') + x.qty, at: x.at, by: x.by, to: x.to, note: x.note || '—' }));
        return { ref:o.ref, title:o.title, project:o.project, activity:o.activity, reqBy:o.reqBy, by:o.by,
          remarks: o.remarks || 'No remarks', status:o.status, statusStyle: this.pill(ISTAT[o.status][0], ISTAT[o.status][1]),
          fulfilLabel: fulfilState(o).label, fulfilStyle: fulfilState(o).style, fulfilTxt: fulfilState(o).txt,
          chain: mkChain(o.stage),
          issueHist: hist, noIssues: hist.length === 0,
          issueCount: hist.length + (hist.length===1?' movement':' movements'),
          fulfilPending: ff.pending, fulfilComplete: ff.complete, canIssueNow: ff.issuable > 0,
          fulfilSummary: (() => {
            if (ff.complete) return 'Fully issued to site — nothing pending';
            const per = {};
            ff.lines.filter(l => l.pending > 0).forEach(l => { const u = l.unit || 'units';
              per[u] = per[u] || { pend:0, able:0 }; per[u].pend += l.pending; per[u].able += l.canIssue; });
            const pend = Object.entries(per).map(([u,v]) => Math.round(v.pend*100)/100 + ' ' + u).join(' · ');
            const able = Object.entries(per).filter(([,v]) => v.able > 0).map(([u,v]) => Math.round(v.able*100)/100 + ' ' + u).join(' · ');
            return pend + ' pending' + (able ? ' · ' + able + ' issuable from stock now' : ' · nothing available in stock');
          })(),
          issueNow: () => setS({ inView:null, isBuild:'new', isDraft: isDraftOf(o) }), lines: ls, lineCount: ls.length + (ls.length===1?' item':' items'),
          edit: () => setS({ inView:null, inBuild:'edit', inDraft: inDraftOf(o), inPick:'' }),
          del: () => setS({ confirmDel: { kind:'indent', id:o.ref, label:o.ref } }),
          toPO: () => setS({ inView:null, screen:'pos', poBuild:'new', poPick:'',
            poDraft: { ...inDraftOf(null), no: autoNo('po'), remarks:'', indents:[o.ref], vendor:'', delivery:'', terms:'30 days credit · delivery at site', project:o.project,
              lines: raw.map(l => { const m = items.find(x => x.code === l.code); const sf = inShortfall(l);
                return { name:l.name, code:l.code, unit:l.unit || (m?m.unit:''), qty: String(sf.short || l.qty || ''), rate:'', fromIndent:o.ref }; }),
              rev:0, editing:false } }) }; })(),
      inViewClose: () => setS({ inView: null }),
      inRef: ID_.ref, inIsEdit: !!ID_.editing,
      inProjSel: ID_.project, inProjChange: (e) => iSet({ project: e.target.value }),
      inProjOpts: ['NN Skyline','NN Riverview','NN Meadows'].map(o=>({o})),
      inActivity: ID_.activity, inActivityChange: (e) => iSet({ activity: e.target.value }),
      inReqBy: ID_.reqBy, inReqByChange: (e) => iSet({ reqBy: e.target.value }),
      inRemarks: ID_.remarks, inRemarksChange: (e) => iSet({ remarks: e.target.value }),
      inPick: S.inPick, inPickChange: (e) => setS({ inPick: e.target.value }),
      inPool: inPoolFn().map(it => ({ name:it.name, code:it.code, unit:it.unit, stock: it.stock + ' ' + it.unit + ' in stock',
        add: () => iSet({ lines: [...ID_.lines, { name:it.name, code:it.code, unit:it.unit, qty:'' }] }) })),
      inPoolEmpty: inPoolFn().length === 0,
      inLines: ID_.lines.map((l,i) => { const sf = inShortfall(l);
        return { name:l.name, code:l.code, unit:l.unit, qty:l.qty,
          stockTxt: sf.have + ' ' + (l.unit||''),
          verdict: !l.qty ? 'Enter quantity' : sf.short > 0 ? (sf.fromStock ? 'Issue ' + sf.fromStock + ' · PO ' + sf.short : 'PO ' + sf.short + ' ' + (l.unit||'')) : 'Full issue from stock',
          vStyle: this.pill(!l.qty ? '#8A90B3' : sf.short > 0 ? (sf.fromStock ? '#0672A6' : '#B4530A') : '#177049',
            !l.qty ? '#F1F4FB' : sf.short > 0 ? (sf.fromStock ? '#E3F2FC' : '#FDF3E7') : '#E4F6EC'),
          qtyChange: (e) => iSet({ lines: ID_.lines.map((x,j) => j===i ? {...x, qty:e.target.value} : x) }),
          remove: () => iSet({ lines: ID_.lines.filter((x,j) => j!==i) }) }; }),
      inNoLines: ID_.lines.length === 0, inLineCount: ID_.lines.length + (ID_.lines.length===1?' item':' items'),
      inSubmit, inSubmitLabel: ID_.editing ? 'Save indent' : 'Raise indent & send for approval',
      inCancel: () => setS({ inBuild:null, inDraft:null }),
      poBuildOpen: !!S.poBuild, poListOpen: !S.poBuild && !S.poPrint && !S.poView,
      poNo: D.no, poIsEdit: !!D.editing,
      poRevNote: D.editing ? 'Editing an approved PO creates revision ' + ((D.rev||0)+1) + ' and restarts approval at Project Manager.' : 'Raised POs go to Project Manager, then Admin.',
      poVendorSel: D.vendor, poVendorOpts: [{o:'Select vendor…'}, ...VDATA.filter(v=>!isGone('vendor', v.name)).map(v=>({o:v.name}))],
      poVendorChange: (e) => dSet({ vendor: e.target.value === 'Select vendor…' ? '' : e.target.value }),
      poIndentChips: IDATA.filter(i=>!isGone('indent', i.ref)).map(i => { const on = D.indents.includes(i.ref);
        return { ref:i.ref, title:i.title, on,
          toggle: () => {
            if (on) {
              dSet({ indents: D.indents.filter(x=>x!==i.ref),
                lines: D.lines.filter(l => l.fromIndent !== i.ref) });
            } else {
              const src = (i.lines && i.lines.length ? i.lines : []).filter(l => !D.lines.some(x => x.code === l.code));
              const added = src.map(l => { const m = items.find(x => x.code === l.code);
                return { name:l.name, code:l.code, unit:l.unit || (m ? m.unit : ''), qty: String(l.qty || ''), rate:'', fromIndent: i.ref }; });
              dSet({ indents: [...D.indents, i.ref], lines: [...D.lines, ...added] });
              if (added.length) this.toast(added.length + (added.length===1?' item':' items') + ' pulled from ' + i.ref + ' — edit qty or rate as needed');
            }
          },
          style: { display:'flex', alignItems:'center', gap:'8px', textAlign:'left', width:'100%', cursor:'pointer',
            border:'1px solid ' + (on ? '#0089C9' : '#E9EDF6'), background: on ? '#E3F2FC' : '#FAFBFE',
            borderRadius:'9px', padding:'8px 11px' },
          boxStyle: { width:'15px', height:'15px', borderRadius:'4px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
            border:'1.5px solid ' + (on ? '#0089C9' : '#C6CFE8'), background: on ? '#0089C9' : '#fff',
            font:"800 9px 'Public Sans',sans-serif", color:'#fff' },
          mark: on ? '✓' : '' }; }),
      poIndentCount: D.indents.length ? D.indents.length + (D.indents.length===1?' indent linked':' indents linked') : 'Optional — none linked',
      poProjSel: D.project, poProjChange: (e) => dSet({ project: e.target.value }),
      poProjOpts: ['NN Skyline','NN Riverview','NN Meadows'].map(o=>({o})),
      poDelivery: D.delivery, poDeliveryChange: (e) => dSet({ delivery: e.target.value }),
      poTerms: D.terms, poTermsChange: (e) => dSet({ terms: e.target.value }),
      poRemarks: D.remarks, poRemarksChange: (e) => dSet({ remarks: e.target.value }),
      poPick: S.poPick, poPickChange: (e) => setS({ poPick: e.target.value }),
      poPool: poPoolFn().map(it => ({ name: it.name, code: it.code, unit: it.unit, stock: it.stock + ' ' + it.unit + ' in stock',
        add: () => dSet({ lines: [...D.lines, { name: it.name, code: it.code, unit: it.unit, qty: '', rate: '' }] }) })),
      poPoolEmpty: poPoolFn().length === 0,
      poLines: D.lines.map((l, i) => ({ name: l.name, code: l.code, unit: l.unit, qty: l.qty, rate: l.rate,
        fromIndent: l.fromIndent || '', hasOrigin: !!l.fromIndent,
        amount: lineTotal(l) ? inr(lineTotal(l)) : '—',
        qtyChange: (e) => dSet({ lines: D.lines.map((x,j) => j===i ? {...x, qty:e.target.value} : x) }),
        rateChange: (e) => dSet({ lines: D.lines.map((x,j) => j===i ? {...x, rate:e.target.value} : x) }),
        remove: () => dSet({ lines: D.lines.filter((x,j) => j!==i) }) })),
      poNoLines: D.lines.length === 0, poLineCount: D.lines.length + (D.lines.length===1?' item':' items'),
      poSubtotal: inr(poSubtotal), poGst: inr(poGst), poGrand: inr(poGrand),
      poSubmit, poSubmitLabel: D.editing ? 'Save revision & send for approval' : 'Raise PO & send for approval',
      poCancel: () => setS({ poBuild: null, poDraft: null }),
      poViewOpen: !!S.poView,
      poVD: (() => { const o = S.poView; if (!o) return { lines: [], trail: [], edits: [] };
        const ls = poLinesOf(o).map((l,i) => ({ sl:String(i+1), name:l.name, code:l.code,
          qty: (l.qty||'—') + ' ' + (l.unit||''), rate: l.rate ? '₹' + Number(l.rate).toLocaleString('en-IN') : '—',
          amount: lineTotal(l) ? inr(lineTotal(l)) : '—' }));
        const sub = poLinesOf(o).reduce((s,l)=>s+lineTotal(l),0);
        const refs = (o.indents && o.indents.length ? o.indents : (o.indent && o.indent !== '—' ? [o.indent] : [])).map(r=>({r}));
        const step = (done, label, who, when) => ({ label, who: who || 'Pending', when: when || '—', done: !!done,
          dotStyle: { width:'26px', height:'26px', borderRadius:'99px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
            background: done ? '#1F9D66' : '#E9EDF6', color: done ? '#fff' : '#9BA1C2', font:"800 11px 'Public Sans',sans-serif" },
          mark: done ? '✓' : '•' });
        return { no:o.no, vendor:o.vendor, project:o.project||'NN Skyline', terms:o.terms||'—', delivery:o.delivery,
          remarks: o.remarks || 'No remarks', hasRemarks: !!o.remarks,
          status:o.status, statusStyle: this.pill((o.st||['#5A6080','#F1F4FB'])[0], (o.st||['#5A6080','#F1F4FB'])[1]),
          rev: o.rev ? 'Revision ' + o.rev : 'Original', items: o.items, value: o.value,
          refs, noRefs: refs.length === 0, lines: ls, lineCount: ls.length + (ls.length===1?' line':' lines'),
          subtotal: sub ? inr(sub) : o.value, gst: sub ? inr(Math.round(sub*0.18)) : '—', grand: sub ? inr(sub + Math.round(sub*0.18)) : o.value,
          receipts: grnsOfPO(o.no).map(g => ({ no:g.no, at: g.receivedAt || fmtD(g.dt), by: g.receiver || g.insp || '—',
            acc: g.acc || '—', rej: g.rej || 'none', short: g.short || 'none',
            photo: g.photo || 'no photo', invoice: g.invoiceNo || 'invoice pending',
            invStyle: this.pill(g.invoiceNo ? '#177049' : '#B4530A', g.invoiceNo ? '#E4F6EC' : '#FDF3E7'),
            match: g.match, matchStyle: {...this.pill((g.mc||['#5A6080','#F1F4FB'])[0], (g.mc||['#5A6080','#F1F4FB'])[1]), fontSize:'9.5px'},
            lines: (g.lines||[]).map(l => ({ txt: l.name + ' — ' + (l.recd||'0') + ' ' + (l.unit||'') + ((parseFloat(l.rej)||0) ? ' (' + l.rej + ' rejected)' : '') })),
            open: () => setS({ poView:null, screen:'grn', grView: g }) })),
          noReceipts: grnsOfPO(o.no).length === 0,
          receiptCount: grnsOfPO(o.no).length + (grnsOfPO(o.no).length===1?' goods receipt':' goods receipts'),
          fulfilRows: poFulfil(o).lines.map(l => { const pctv = l.ordered ? Math.min(100, Math.round(l.already / l.ordered * 100)) : 0;
            return { name:l.name, code:l.code, ordered: l.ordered + ' ' + (l.unit||''),
              got: l.already + ' ' + (l.unit||''), pending: l.balance + ' ' + (l.unit||''),
              pct: pctv + '%',
              state: l.balance === 0 ? 'Fulfilled' : l.already ? 'Part received' : 'Not received',
              stStyle: this.pill(l.balance === 0 ? '#177049' : l.already ? '#B4530A' : '#8A90B3',
                l.balance === 0 ? '#E4F6EC' : l.already ? '#FDF3E7' : '#F1F4FB'),
              barOuter: { height:'7px', background:'#EEF1F8', borderRadius:'99px', overflow:'hidden', marginTop:'6px' },
              barInner: { height:'100%', width: pctv + '%', borderRadius:'99px',
                background: l.balance === 0 ? 'linear-gradient(90deg,#1F9D66,#5BC8A2)' : 'linear-gradient(90deg,#E8A13A,#F2C063)' } }; }),
          fulfilPending: poFulfil(o).pending, fulfilComplete: poFulfil(o).complete,
          fulfilSummary: poFulfil(o).complete ? 'All ordered quantities received' : poFulfil(o).pending + ' units still pending across ' + poFulfil(o).lines.filter(l=>l.balance>0).length + ' line(s)',
          newGRN: () => setS({ poView:null, screen:'grn', grBuild:'new', grPick:'',
            grDraft: (() => { const f = poFulfil(o);
              return { no: autoNo('grn'), po:o.no, poRec:o, receiver:'', photo:'', remarks:'', invoiceNo:'', invoiceLater:true,
                lines: f.lines.map(l => ({ name:l.name, code:l.code, unit:l.unit||'', ordered:String(l.ordered),
                  already:String(l.already), balance:String(l.balance), recd:'', rej:'' })), editing:false }; })() }),
          trail: [ step(true, 'Raised', o.createdBy, o.createdAt),
                   step(!!o.pmBy, 'Project Manager approval', o.pmBy, o.pmAt),
                   step(!!o.admBy, 'Admin approval', o.admBy, o.admAt) ],
          edits: (o.editLog||[]).map(e => ({ what:e.what, meta: e.by + ' · ' + e.at })), noEdits: (o.editLog||[]).length === 0,
          pending: o.status === 'Pending PM approval' || o.status === 'Pending admin approval',
          apLabel: o.status === 'Pending PM approval' ? '✓ PM approve' : '✓ Admin approve',
          apStyle: { border:'none', background: o.status === 'Pending PM approval' ? '#E8A13A' : '#6A46C8', color:'#fff',
            font:"700 12.5px 'Public Sans',sans-serif", borderRadius:'9px', padding:'11px 17px', cursor:'pointer' },
          approve: () => { poApprove(o)(); setS({ poView: null }); },
          edit: () => setS({ poView: null, poBuild:'edit', poDraft: poDraftOf(o), poPick:'' }),
          print: () => setS({ poView: null, poPrint: o }) }; })(),
      poViewClose: () => setS({ poView: null }),
      poPrintOpen: !!S.poPrint,
      poPrintDoc: (() => { const o = S.poPrint; if (!o) return { lines: [], rows: [] };
        const ls = poLinesOf(o).map((l,i) => ({ sl: String(i+1), name: l.name, code: l.code, qty: (l.qty||'—') + ' ' + (l.unit||''),
          rate: l.rate ? '₹' + Number(l.rate).toLocaleString('en-IN') : '—', amount: lineTotal(l) ? inr(lineTotal(l)) : '—' }));
        const sub = poLinesOf(o).reduce((s,l)=>s+lineTotal(l),0);
        const refs = (o.indents && o.indents.length ? o.indents : (o.indent && o.indent !== '—' ? [o.indent] : []));
        return { no:o.no, vendor:o.vendor, indent: refs.length ? refs.join(' · ') : 'Direct purchase — no indent', remarks: o.remarks || '—', hasRemarks: !!o.remarks, project:o.project||'NN Skyline', terms:o.terms||'—',
          delivery:o.delivery, status:o.status, lines:ls, rev: o.rev ? 'Revision ' + o.rev : 'Original',
          subtotal: sub ? inr(sub) : o.value, gst: sub ? inr(Math.round(sub*0.18)) : '—', grand: sub ? inr(sub + Math.round(sub*0.18)) : o.value,
          createdBy:o.createdBy, createdAt:o.createdAt,
          pmBy:o.pmBy || 'Pending', pmAt:o.pmAt || '—', admBy:o.admBy || 'Pending', admAt:o.admAt || '—' }; })(),
      poPrintClose: () => setS({ poPrint: null }),
      poDoPrint: () => window.print(),
      pcNewLabel: { indents:'+ New indent', pos:'+ New purchase order', grn:'+ New GRN', items:'+ New item', vendors:'+ New vendor' }[S.screen],
      pcNew: () => { if (S.screen === 'pos') { setS({ poBuild:'new', poDraft: poDraftOf(null), poPick:'' }); return; }
        if (S.screen === 'indents') { setS({ inBuild:'new', inDraft: inDraftOf(null), inPick:'' }); return; }
        if (S.screen === 'grn') { setS({ grBuild:'new', grDraft: grDraftOf(null), grPick:'' }); return; }
        if (S.screen === 'items') { setS({ itBuild:'new', itDraft:{} }); return; }
        if (S.screen === 'vendors') { setS({ vnBuild:'new', vnDraft:{} }); return; }
        pcOpen({ grn:'grn', items:'item', vendors:'vendor' }[S.screen], 'new', {}); },
      ptItems: S.screen==='items', ptVendors: S.screen==='vendors',
      vendorCount: liveVendors.length + ' vendor' + (liveVendors.length===1?'':'s') + ' · ' + liveVendors.filter(v=>v.status==='Active').length + ' active',
      restockCount: lowItems.length,
      restockBanner: lowItems.length + ' item' + (lowItems.length===1?'':'s') + ' below reorder level — raise a PO to refill stock',
      restockNames: lowItems.map(x=>x.name).join(' · '),
      hasRestock: lowItems.length > 0,
      restockAct: () => { setS({ screen:'pos' }); this.toast('Opening purchase orders — raise a PO for the short items'); },
      procItems: liveItems
        .filter(it => hitsQ([it.name,it.code,it.spec]) && (S.prA==='All' || it.unit===S.prA)
          && (S.prB==='All' || (() => { const st=parseFloat(it.stock)||0, rl=parseFloat(it.reorder)||0;
            const state = st < rl ? 'Restock now' : st < rl*1.25 ? 'Order soon' : 'Healthy'; return state===S.prB; })()))
        .map(it => ({ ...it, ...rowActs('item', { code:it.code }, it.code, it.name),
        edit: () => setS({ itBuild:'edit', itDraft: { name:it.name, code:it.code, unit:it.unit, stock:it.stock, reorder:it.reorder, spec:it.spec } }),
        view: () => setS({ itView: it }) })),
      pcAutoCode: S.pcMode==='edit' ? ((S.pcFields||{}).code || (S.pcFields||{}).ref || (S.pcFields||{}).no || '—') : autoNo(S.pcForm || 'item'),
      pcAutoLabel: { indent:'Indent no.', po:'PO no.', grn:'GRN no.', item:'Item code', vendor:'Vendor code' }[S.pcForm || 'item'],
      pcHasAuto: ['indent','po','grn','item','vendor'].includes(S.pcForm || ''),
      unitOpts: [{o:'Select unit…'}].concat((S.uomList||[]).map(o=>({o}))),
      newUnit: S.newUnit, newUnitChange:(e)=>setS({newUnit:e.target.value}),
      addUnit: () => { if(!S.newUnit.trim())return; setS({ uomList:[...S.uomList, S.newUnit], pcFields:{...(S.pcFields||{}), unit:S.newUnit}, itDraft: S.itBuild ? { ...(S.itDraft||{}), unit:S.newUnit } : S.itDraft, newUnit:'' }); this.toast('Unit "'+S.newUnit+'" added to the master'); },
      pcIsItem: (S.pcForm==='item'),
      pcFormOpen: !!S.pcForm, pcFormTitle: (S.pcMode==='edit'?'Edit ':'New ') + pcDef.title,
      pcFormCta: S.pcMode==='edit' ? 'Save changes' : 'Create ' + pcDef.title.toLowerCase(),
      pcFormFields, pcClose: () => setS({ pcForm:null }),
      pcSave: () => { const miss = pcDef.fields.filter(f=>f.req && !((S.pcFields||{})[f.k]||'').trim());
        if (miss.length) { this.toast(miss[0].l + ' is required'); return; }
        const isItem = S.pcForm==='item';
        if (isItem) {
          const f = S.pcFields || {};
          const base = items.map(x => ({ name:x.name, code:x.code, unit:x.unit, stock:x.stock, reorder:x.reorder, spec:x.spec }));
          if (S.pcMode === 'edit') {
            const next = base.map(x => x.code === f.code ? { ...x, name:f.name, unit:f.unit, stock:f.stock||'0', reorder:f.reorder||'0', spec:f.spec||'' } : x);
            setS({ pcForm:null, itemList: next });
            this.toast('"' + f.name + '" updated');
          } else {
            const code = nextCode();
            setS({ pcForm:null, itemSeq:(S.itemSeq||1)+1, itemList: [{ name:f.name, code, unit:f.unit, stock:f.stock||'0', reorder:f.reorder||'0', spec:f.spec||'' }, ...base] });
            this.toast('"' + f.name + '" created · code ' + code);
          }
          return;
        }
        const kind = S.pcForm, f = S.pcFields || {};
        const LK = { indent:'indentList', po:'poList', grn:'grnList', vendor:'vendorList' }[kind];
        const SRC = { indent:IDATA, po:PODATA, grn:GRNDATA, vendor:VDATA }[kind];
        const KEY = { indent:'ref', po:'no', grn:'no', vendor:'name' }[kind];
        if (!LK) { setS({ pcForm:null }); this.toast(pcDef.title + ' updated'); return; }
        if (S.pcMode === 'edit') {
          const key = f[KEY] || f.code;
          setS({ pcForm:null, [LK]: SRC.map(x => (x[KEY] === key || x.code === f.code) ? { ...x, ...f } : x) });
          this.toast(pcDef.title + ' updated'); return;
        }
        const no = autoNo(kind);
        const seeds = {
          indent: { ref:no, project:f.project||'—', title:f.title||'—', activity:f.activity||'—', reqBy:f.reqBy||'—', value:f.value||'—', by:f.by||S.role, age:'just raised', hot:false, stage:1, status:'PM approval', fulfil:'PO', fulfilTxt:'Awaiting store stock check' },
          po: { no, indent:f.indent||'—', vendor:f.vendor||'—', items:f.items||'—', value:f.value||'—', delivery:f.delivery||'Awaiting approval', del:'wait', status:'Pending approval', st:['#B4530A','#FDF3E7'] },
          grn: { no, po:f.po||'—', vendor:f.vendor||'—', item:f.item||'—', insp:f.insp||S.role, acc:f.acc||'—', rej:f.rej && f.rej!=='0' ? f.rej : false, short:f.short && f.short!=='0' ? f.short : false, match:'Awaiting 3-way match', mc:['#B4530A','#FDF3E7'] },
          vendor: { code:no, name:f.name, contact:f.contact||'—', mobile:f.mobile||'—', email:f.email||'—', cats:f.cats||'—', gst:f.gst||'—', pan:f.pan||'—', terms:f.terms||'—', bank:f.bank||'—', addr:f.addr||'—', rating:'—', ontime:'—', pos:'0', spend:'₹0', status:'Active' }
        };
        setS({ pcForm:null, seq: { ...(S.seq||{}), [kind]: ((S.seq||{})[kind] || 1) + 1 }, [LK]: [seeds[kind], ...SRC] });
        this.toast(pcDef.title + ' created · ' + no); },
      pcViewOpen: !!pcVw, pcViewTitle: pcVw ? PCDEF[pcVw.kind].title : '', pcViewRows,
      pcViewClose: () => setS({ pcView:null }),
      pcViewEdit: () => { if (!pcVw) return; setS({ pcView:null, pcForm:pcVw.kind, pcMode:'edit', pcFields:pcVw.data }); },
      pcViewDel: () => { if (pcVw) pcDel(pcVw.kind, pcVw.id, pcVw.label)(); },
      leadHeader: S.leads.filter(l=>l.stage!=='lost'&&l.stage!=='booked').length + ' open leads',
      leadOpen: S.leadOpen, openLead: () => setS({ leadOpen: true, leadName:'', leadMobile:'', leadSource:'' }), closeLead: () => setS({ leadOpen: false }),
      leadFormFields,
      saveLead: () => {
        if (!S.leadName.trim() || !S.leadMobile.trim() || !S.leadSource) { this.toast('Name, mobile number and source are mandatory'); return; }
        const id = Math.max(0, ...S.leads.map(l=>l.id)) + 1;
        setS({ leads: [...S.leads, { id, name:S.leadName, src:S.leadSource, want:'New enquiry', budget:'', stage:'new', mobile: S.leadCC + ' ' + S.leadMobile }], leadOpen:false });
        this.toast('Lead captured — ' + S.leadName + ' added to New');
      },
      leadGrid: S.leadView==='grid', leadList: S.leadView==='list',
      viewChips: [['grid','▦ Grid'],['list','☰ List']].map(v => ({ label:v[1], pick:()=>setS({leadView:v[0]}),
        style:{ border:'1px solid '+(S.leadView===v[0]?'#0089C9':'#E3E7F2'), background:S.leadView===v[0]?'#E3F2FC':'#fff', color:S.leadView===v[0]?'#0672A6':'#7A80A3', font:"700 12px 'Public Sans',sans-serif", borderRadius:'8px', padding:'8px 13px', cursor:'pointer' } })),
      lfSearch: S.lfSearch, lfSearchChange: (e)=>setS({lfSearch:e.target.value}),
      lfStageOpts: ['All'].concat(S.leadStages.map(s=>s.name)).map(o=>({o})), lfStageSel: S.lfStage, lfStageChange:(e)=>setS({lfStage:e.target.value}),
      lfSourceOpts: ['All','Website','MagicBricks','99acres','Walk-in','Referral'].map(o=>({o})), lfSourceSel: S.lfSource, lfSourceChange:(e)=>setS({lfSource:e.target.value}),
      lfFUOpts: ['All','Overdue','Today','Upcoming','None'].map(o=>({o})), lfFUSel: S.lfFU, lfFUChange:(e)=>setS({lfFU:e.target.value}),
      lfSelStyle: { border:'1px solid #E3E7F2', borderRadius:'9px', padding:'9px 11px', font:"600 12px 'Public Sans',sans-serif", color:'#22264A', background:'#fff', outline:'none', cursor:'pointer' },
      lfActive: !!(S.lfSearch || S.lfStage!=='All' || S.lfSource!=='All' || S.lfFU!=='All'),
      lfCount: S.leads.filter(passes).length + ' of ' + S.leads.length + ' leads shown',
      fuPager: fuPg, fuPerOpts: [12,24,48].map(n=>({n:String(n)})), fuPerSel: String(S.fuPer),
      fuPerChange: (e)=>setS({ fuPer: parseInt(e.target.value), fuPage: 1 }),
      lfClear: () => setS({ lfSearch:'', lfStage:'All', lfSource:'All', lfFU:'All' }),
      exportLeads: () => this.toast('Exporting ' + S.leads.filter(passes).length + ' leads to leads_export.xlsx — filters applied'),
      importOpen: S.importOpen, openImport: () => setS({ importOpen: true }), closeImport: () => setS({ importOpen: false }),
      downloadSample: () => this.toast('Sample template downloaded — lead_import_template.xlsx'),
      runImport: () => { setS({ importOpen: false }); this.toast('Import queued — rows validated against Lead Settings before insert'); },
      sampleCols: [
        { c:'Name', req:true, eg:'Rahul Menon' }, { c:'Country code', req:true, eg:'+91' },
        { c:'Mobile number', req:true, eg:'9876543210' }, { c:'Source', req:true, eg:'Website' },
        { c:'Email', req:false, eg:'rahul@email.com' }, { c:'Budget', req:false, eg:'7800000' },
        { c:'Interested in', req:false, eg:'2 BHK' }, { c:'Preferred project', req:false, eg:'NN Skyline' },
        { c:'Stage', req:false, eg:'New' }, { c:'Requirement notes', req:false, eg:'Park facing preferred' }
      ].map(x => ({ ...x, reqLabel: x.req?'Mandatory':'Optional', reqStyle: this.pill(x.req?'#B23334':'#4A5077', x.req?'#FCEDED':'#EEF1F9') })),
      leadPager: leadPg,
      leadPerOpts: [10,25,50].map(n=>({n:String(n)})), leadPerSel: String(S.leadPer),
      leadPerChange: (e)=>setS({ leadPer: parseInt(e.target.value), leadPage: 1 }),
      leadRows: leadPg.slice(S.leads.filter(passes)).map(l => { const stg = S.leadStages.find(s=>s.id===l.stage) || {name:l.stage};
        const f = nextFU(l), c = f ? FUC[fuState(f)] : null;
        return { name:l.name, src:l.src, want:l.want, budget:l.budget || '—', stage:stg.name,
          mobile: l.mobile || '—',
          srcStyle: {...this.pill(srcOf(l.src)[0], srcOf(l.src)[1]), fontSize:'10px'},
          stStyle: this.pill(l.stage==='booked'?'#177049':l.stage==='lost'?'#B23334':'#2F308C', l.stage==='booked'?'#E4F6EC':l.stage==='lost'?'#FCEDED':'#EFF3FB'),
          hasFU: !!f, fuTxt: f ? ((f.type==='Call'?'📞 ':'🏠 ') + f.type + ' · ' + fuFmt(f.date) + ' ' + f.time) : '',
          fuBadge: c ? c.label : '', fuBadgeStyle: c ? { font:"800 8.5px 'Public Sans',sans-serif", color:'#fff', background:c.fg, borderRadius:'99px', padding:'3px 7px', letterSpacing:'.06em' } : {},
          fuStyle: c ? { font:"600 11.5px 'Public Sans',sans-serif", color:c.fg } : {},
          open: () => setS({ selLead: l.id, leadTab: 'timeline' }) }; }),
      isLeadsBoard: S.selLead == null, hasLead: !!ldObj, ld, ldBack: () => setS({ selLead: null }),
      ldHasNextFU: !!(ldObj && ld.nextFUChip), ldNextFU: ld.nextFUChip || { label:'', type:'', when:'', style:{}, badgeStyle:{}, textStyle:{} },
      ldTimeline: S.leadTab==='timeline', ldFUs: S.leadTab==='fus', ldNotes: S.leadTab==='notes', ldShist: S.leadTab==='shist', ldFiles: S.leadTab==='files', ldFlats: S.leadTab==='flats',
      ldAvail, ldNoFlats: !!ldObj && (ldObj.flats||[]).length===0, ldTowerChips: ['A','B','C'].map(t => ({ label:'Tower '+t, pick:()=>setS({ldTower:t}), style: fchip(S.ldTower===t) })),
      newNote: S.newNote, newNoteChange: (e)=>setS({newNote:e.target.value}),
      addNote: () => { if(!S.newNote.trim())return; const by = S.role;
        setS({ newNote:'', leads:S.leads.map(x=>x.id===S.selLead?{...x, notes:[{txt:S.newNote, at:now(), by},...(x.notes||[])], history:[{t:'note', txt:'Note added by '+by+' — '+S.newNote, at:now()},...histOf(x)]}:x) }); },
      fuTypeChips: ['Call','Site Visit Scheduled'].map(t => ({ label:t, pick:()=>setS({fuType:t}),
        style:{ border:'2px solid '+(S.fuType===t?'#0089C9':'#E3E7F2'), background:S.fuType===t?'#E3F2FC':'#fff', color:S.fuType===t?'#0672A6':'#5A6080', font:`${S.fuType===t?'700':'600'} 12px 'Public Sans',sans-serif`, borderRadius:'10px', padding:'9px 15px', cursor:'pointer' } })),
      fuDate:S.fuDate, fuDateChange:(e)=>setS({fuDate:e.target.value}),
      fuTime:S.fuTime, fuTimeChange:(e)=>setS({fuTime:e.target.value}),
      fuRemarks:S.fuRemarks, fuRemarksChange:(e)=>setS({fuRemarks:e.target.value}),
      addFU: () => {
        if(!S.fuDate || !S.fuTime){ this.toast('Pick a follow-up date and time'); return; }
        const fu = { type:S.fuType, date:S.fuDate, time:S.fuTime, remarks:S.fuRemarks, at:now(), by:S.role };
        setS({ fuDate:'', fuTime:'', fuRemarks:'',
          leads:S.leads.map(x=>x.id===S.selLead?{...x, followups:[fu,...(x.followups||[])], history:[{t:'fu', txt:S.fuType+' scheduled — '+S.fuDate+' '+S.fuTime, at:now()},...histOf(x)]}:x) });
        this.toast(S.fuType+' scheduled for '+S.fuDate+' at '+S.fuTime);
      },
      ldMail: () => this.toast('Email composer opens with the lead template'),
      ldEdit: () => this.toast('Edit lead — opens the capture form pre-filled'),
      ldUpload: () => this.toast('Attach KYC, cost sheets or brochures to this lead'),
      lostOpen: S.lostFlow != null, lostLead: lostLeadObj ? lostLeadObj.name : '',
      lostReasonOpts: [{r:'Select reason…'}].concat(S.lostReasons.map(r=>({r}))),
      lostReasonChange: (e)=>setS({ lostReason: e.target.value==='Select reason…' ? '' : e.target.value }),
      lostRemarks: S.lostRemarks, lostRemarksChange: (e)=>setS({ lostRemarks: e.target.value }),
      lostCancel: () => setS({ lostFlow: null }),
      lostConfirm: () => {
        if (!S.lostReason) { this.toast('Select a lost reason from the dropdown'); return; }
        setS({ leads: S.leads.map(x => { if (x.id !== S.lostFlow) return x;
          const fromName = (S.leadStages.find(s=>s.id===x.stage)||{}).name || '';
          return { ...x, stage:'lost', lostReason:S.lostReason, lostRemarks:S.lostRemarks,
            history:[{t:'stage', txt:'Marked Lost — '+S.lostReason, at:now(), by:S.role, from:fromName, to:'Lost'}, ...histOf(x)] }; }), lostFlow: null });
        this.toast((lostLeadObj?lostLeadObj.name:'Lead') + ' marked Lost — ' + S.lostReason);
      },
      towers, tower: bTower, floors, towerStats, hasUnit: !!su, noUnit: !su, su: su || { no:'', plan:'', area:'', statusLabel:'', stStyle:{}, lines:[], total:'', canReserve:false, canRelease:false, holder:false },
      isFlatsBoard: S.screen==='flats' && !S.flatSetup,
      flatSetup: S.screen==='flats' && S.flatSetup, openSetup: () => setS({ flatSetup: true }), closeSetup: () => setS({ flatSetup: false }),
      saveSetup: () => {
        if (!S.fsTower.trim()) { this.toast('Tower / block name is mandatory'); return; }
        setS({ flatSetup: false, fsTower: '' });
        this.toast(fsTotal + ' units generated — ' + PDATA[S.fsProject].name + ' · ' + S.fsTower);
      },
      fsTower: S.fsTower, fsTowerChange: (e) => setS({ fsTower: e.target.value }),
      boardProject: PDATA[S.boardProj].name,
      boardProjects: PDATA.filter(p => p.type !== 'Commercial').map((p,i) => ({ label:p.name, pick:()=>setS({ boardProj:i, tower:(PROJ_TOWERS[i]||['A'])[0], selUnit:null }),
        style:{ border:'1px solid '+(S.boardProj===i?'#0089C9':'#E3E7F2'), background:S.boardProj===i?'linear-gradient(140deg,#0089C9,#2F308C)':'#fff', color:S.boardProj===i?'#fff':'#5A6080', font:"700 12px 'Public Sans',sans-serif", borderRadius:'99px', padding:'9px 16px', cursor:'pointer', boxShadow:S.boardProj===i?'0 5px 14px rgba(0,137,201,.25)':'none' } })),
      flStatusChips: ['All','Available','Held','Booked'].map(v => ({ label:v, pick:()=>setS({ flStatus:v }), style: fchip(S.flStatus===v) })),
      flCfgChips: ['All','2 BHK','3 BHK'].map(v => ({ label:v, pick:()=>setS({ flCfg:v }), style: fchip(S.flCfg===v) })),
      fsProjects, fsBrushChips, fsTplCells, fsPreview, fsSummary, fsTotal,
      fsFloorsVal: S.fsFloors, fsPerVal: S.fsPer,
      fsFloorsMinus: () => setS({ fsFloors: Math.max(1, S.fsFloors-1) }), fsFloorsPlus: () => setS({ fsFloors: Math.min(30, S.fsFloors+1) }),
      fsPerMinus: () => setS({ fsPer: Math.max(1, S.fsPer-1) }), fsPerPlus: () => setS({ fsPer: Math.min(8, S.fsPer+1) }),
      fsStepBtn: { width:'30px', height:'30px', border:'1px solid #E3E7F2', background:'#fff', borderRadius:'8px', cursor:'pointer', font:"700 15px 'Public Sans',sans-serif", color:'#0672A6', display:'flex', alignItems:'center', justifyContent:'center' },
      fsHasOver: Object.keys(S.fsOver).length > 0 || Object.keys(S.fsNums).length > 0 || Object.keys(S.fsFloorCounts).length > 0, fsClearOver: () => setS({ fsOver: {}, fsNums: {}, fsFloorCounts: {}, fsEdit: null }),
      fsEditOpen: !!fsEditor, fsEditor: fsEditor || { title:'', num:'', numChange:()=>{}, cfgChips:[], applyFloor:()=>{}, close:()=>{} },
      resFlow: !!S.resFlow, resTitle: S.resFlow==='hold' ? 'Hold unit' : 'Book unit',
      resCta: S.resFlow==='hold' ? 'Reserve on hold' : 'Confirm booking',
      resCustomers, custNew: S.custNew, custExisting: !S.custNew,
      showNewCust: () => setS({ custNew: true, resCust: null }), showPickCust: () => setS({ custNew: false }),
      resConfirm, resCancel: () => setS({ resFlow: null }),
      pickCustStyle: { flex:1, border:'1px solid '+(!S.custNew?'#0089C9':'#E3E7F2'), background:!S.custNew?'#E3F2FC':'#fff', color:!S.custNew?'#0672A6':'#5A6080', font:"700 12px 'Public Sans',sans-serif", borderRadius:'9px', padding:'9px', cursor:'pointer' },
      newCustStyle: { flex:1, border:'1px solid '+(S.custNew?'#0089C9':'#E3E7F2'), background:S.custNew?'#E3F2FC':'#fff', color:S.custNew?'#0672A6':'#5A6080', font:"700 12px 'Public Sans',sans-serif", borderRadius:'9px', padding:'9px', cursor:'pointer' },
      masterNav, masterTitle: (MTABS.find(m=>m[0]===S.masterTab)||MTABS[0])[1],
      mItems: false, mVendors: false, mUsers: S.masterTab==='users',
      mLimits: S.masterTab==='limits', mStores: S.masterTab==='stores', mTax: S.masterTab==='tax', mLeadCfg: S.masterTab==='leadcfg',
      mAddRecord: S.masterTab !== 'leadcfg' && S.masterTab !== 'workforce',
      mAddLabel: { stores:'+ New store', tax:'+ New unit', users:'+ New user', limits:'+ New limit' }[S.masterTab] || '+ Add record',
      mAdd: () => { if (S.masterTab === 'users') { setS({ screen:'hr', hrTab:'people', empForm:{ mode:'new' } }); this.toast('Create the person under Users & Attendance, then map their role here'); return; }
        setS({ mRecord: { tab:S.masterTab, name:'', val:'' } }); },
      mRecOpen: !!S.mRecord,
      mRecF: (() => { const f = S.mRecord; if (!f) return {};
        const T = { stores:['Store name','Location / project'], tax:['Unit name','Description'], limits:['Role','Approval limit (₹)'] }[f.tab] || ['Name','Value'];
        return { title: 'New ' + ({ stores:'store', tax:'unit', limits:'approval limit' }[f.tab] || 'record'),
          l1:T[0], l2:T[1], name:f.name, val:f.val,
          nameChange: (e) => { const v = e.target.value; this.setState(st => ({ mRecord: { ...st.mRecord, name: v } })); },
          valChange: (e) => { const v = e.target.value; this.setState(st => ({ mRecord: { ...st.mRecord, val: v } })); },
          cancel: () => setS({ mRecord: null }),
          save: () => { if (!f.name) { this.toast(T[0] + ' is required'); return; }
            if (f.tab === 'tax') { const cur = S.uomList || [];
              if (cur.includes(f.name)) { this.toast('"' + f.name + '" already exists'); return; }
              setS({ uomList: [...cur, f.name], mRecord: null });
              this.toast('Unit "' + f.name + '" added — available in the item form'); return; }
            setS({ mRecord: null }); this.toast('"' + f.name + '" added to ' + ({ stores:'Store Master', limits:'Approval Limits' }[f.tab] || 'the master')); } }; })(),
      mWorkforce: S.masterTab==='workforce',
      lcTabs: [['fields','Form Fields'],['stages','Pipeline Stages'],['reasons','Lost Reasons']].map(t => ({
        label: t[1], pick: () => setS({ leadCfgTab: t[0] }),
        style: { border:'none', borderBottom:'2.5px solid '+(S.leadCfgTab===t[0]?'#0089C9':'transparent'), background:'transparent', color:S.leadCfgTab===t[0]?'#191A5C':'#7A80A3', font:`${S.leadCfgTab===t[0]?'700':'600'} 13px 'Public Sans',sans-serif`, padding:'10px 4px', cursor:'pointer' } })),
      lcFields: S.leadCfgTab==='fields', lcStages: S.leadCfgTab==='stages', lcReasons: S.leadCfgTab==='reasons',
      lfRows: S.leadFields.map((f,i)=>({
        label:f.label, type:f.type, canDel:!f.fixed, fixed:!!f.fixed,
        options: f.type==='dropdown' ? (f.options||'') : '',
        typeOpts: FTYPES.map(t=>({t, label: TLABEL[t]})),
        typeSel: TLABEL[f.type],
        typeStyle: { border:'1px solid #E3E7F2', borderRadius:'8px', padding:'6px 9px', font:"600 11.5px 'Public Sans',sans-serif", color: f.fixed?'#9BA1C2':'#22264A', background: f.fixed?'#F1F4FB':'#FAFBFE', outline:'none', width:'132px', cursor: f.fixed?'not-allowed':'pointer' },
        typeChange: (e) => f.fixed ? this.toast(f.label+' is a system field') : setS({ leadFields: S.leadFields.map((x,xi)=>xi===i?{...x,type:(FTYPES.find(t=>TLABEL[t]===e.target.value)||'text')}:x) }),
        reqLabel: f.req?'Mandatory':'Optional',
        reqStyle: {...this.pill(f.req?'#B23334':'#4A5077', f.req?'#FCEDED':'#EEF1F9'), cursor:'pointer', border:'none'},
        toggleReq: () => f.fixed ? this.toast(f.label+' is always mandatory') : setS({ leadFields: S.leadFields.map((x,xi)=>xi===i?{...x,req:!x.req}:x) }),
        del: () => setS({ leadFields: S.leadFields.filter((_,xi)=>xi!==i) })
      })),
      nfLabel:S.nfLabel, nfLabelChange:(e)=>setS({nfLabel:e.target.value}),
      nfTypeOpts: FTYPES.map(t=>({t, label: TLABEL[t]})), nfTypeSel: TLABEL[S.nfType],
      nfTypeChange:(e)=>setS({nfType:(FTYPES.find(t=>TLABEL[t]===e.target.value)||'text')}),
      nfTypeStyle: { border:'1px solid #E3E7F2', borderRadius:'9px', padding:'9px 11px', font:"600 12px 'Public Sans',sans-serif", color:'#22264A', background:'#FAFBFE', outline:'none', width:'150px', cursor:'pointer' },
      nfReqLabel: S.nfReq?'Mandatory':'Optional', nfToggleReq:()=>setS({nfReq:!S.nfReq}),
      nfReqStyle: {...this.pill(S.nfReq?'#B23334':'#4A5077', S.nfReq?'#FCEDED':'#EEF1F9'), cursor:'pointer', border:'none'},
      nfIsDrop: S.nfType==='dropdown', nfOptions:S.nfOptions, nfOptionsChange:(e)=>setS({nfOptions:e.target.value}),
      nfAdd: () => { if(!S.nfLabel.trim()){this.toast('Give the field a label first');return;}
        setS({ leadFields:[...S.leadFields, {label:S.nfLabel, type:S.nfType, req:S.nfReq, options:S.nfOptions}], nfLabel:'', nfOptions:'', nfReq:false, nfType:'text' });
        this.toast('Field added to the lead form'); },
      stRows: S.leadStages.map((st,i)=>({ name:st.name, fixed:st.fixed, canDel:!st.fixed,
        change:(e)=>setS({ leadStages:S.leadStages.map((x,xi)=>xi===i?{...x,name:e.target.value}:x) }),
        del:()=>{ const n=S.leads.filter(l=>l.stage===st.id).length; if(n){this.toast('⚠ Cannot remove "'+st.name+'" — '+n+' lead'+(n>1?'s are':' is')+' in this stage. Move them first.');return;} setS({ leadStages:S.leadStages.filter((_,xi)=>xi!==i) }); this.toast('Stage "'+st.name+'" removed from the pipeline'); } })),
      newStage:S.newStage, newStageChange:(e)=>setS({newStage:e.target.value}),
      addStage:()=>{ if(!S.newStage.trim())return; const arr=[...S.leadStages]; arr.splice(arr.findIndex(x=>x.id==='booked'),0,{id:'st'+Date.now(),name:S.newStage,fixed:false}); setS({ leadStages:arr, newStage:'' }); this.toast('Stage added before Booked'); },
      lrChips: S.lostReasons.map((r,i)=>({ r, del:()=>setS({ lostReasons:S.lostReasons.filter((_,xi)=>xi!==i) }) })),
      newReason:S.newReason, newReasonChange:(e)=>setS({newReason:e.target.value}),
      addReason:()=>{ if(!S.newReason.trim())return; setS({ lostReasons:[...S.lostReasons,S.newReason], newReason:'' }); },
      items, vendors, users, limits, stores, taxes, uoms
    };
  }
}
