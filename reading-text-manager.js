/* sanaTextManager: إدارة النصوص المحفوظة واختيار النص الحالي. */
const sanaTextManager = {
  STORAGE_KEY: 'readingSavedTextsV1',
  SELECTED_KEY: 'readingSelectedTextV1',
  list: [],
  current: {id:'', name:'', text: DEFAULT_TEXT},
  load(){
    try{ this.list = JSON.parse(localStorage.getItem(this.STORAGE_KEY)||'[]'); if(!Array.isArray(this.list)) this.list=[]; }
    catch(e){ this.list=[]; }
    if(!this.list.length){ this.list=[{id:uid(), name:'النص الافتراضي', text: DEFAULT_TEXT}]; }
    let selected=''; try{ selected = localStorage.getItem(this.SELECTED_KEY)||''; }catch(e){}
    this.current = this.list.find(x=>x.id===selected) || this.list[0];
    try{
      window.sanaTextSync?.publish(this.current.text, {name:this.current.name, textId:this.current.id});
    }catch(e){}
  },
  save(){
    try{
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.list));
      localStorage.setItem(this.SELECTED_KEY, this.current.id);
      window.sanaTextSync?.publish(this.current.text, {name:this.current.name, textId:this.current.id});
    }catch(e){}
  },
  findIndex(id){ return this.list.findIndex(x=>x.id===id); },
  select(id){
    const t=this.list.find(x=>x.id===id); if(!t) return null;
    this.current=t; this.save(); return t;
  },
  create(name, text){
    const t={id:uid(), name, text};
    this.list.push(t); this.current=t; this.save();
    return t;
  },
  update(id, patch){
    const i=this.findIndex(id); if(i<0) return null;
    this.list[i]={...this.list[i], ...patch}; this.current=this.list[i]; this.save();
    return this.list[i];
  },
  remove(id){
    if(this.list.length<=1) return null;
    const i=this.findIndex(id); if(i<0) return null;
    const removed=this.list[i];
    this.list.splice(i,1);
    this.current=this.list[Math.max(0,i-1)];
    this.save();
    return removed;
  },
  upsert(entry){
    const i = entry.id ? this.findIndex(entry.id) : -1;
    if(i>=0){ this.list[i]=entry; }
    else { if(!entry.id) entry.id=uid(); this.list.push(entry); }
    this.current=entry; this.save();
    return entry;
  }
};
window.sanaTextManager = sanaTextManager;
