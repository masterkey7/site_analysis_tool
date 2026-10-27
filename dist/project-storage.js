// Compare against the version actually read by this window, including legacy
// projects. Web Locks serializes the read/check/write across cooperating tabs.
export function createProjectStorage({storage,key,locks,onIssue=()=>{},newId=()=>crypto.randomUUID()}){
 let baseline=null,failedRead=false,lastState='',dirty=false,conflict=false;
 try{baseline=storage.getItem(key)??null;}catch{failedRead=true;}
 function issue(kind){onIssue(kind);}
 return {
  get raw(){return baseline;},get dirty(){return dirty;},get conflict(){return conflict;},
  markClean(state){lastState=JSON.stringify(state);dirty=false;},
  changed(state){dirty=JSON.stringify(state)!==lastState;return dirty;},
  observe(value){if((value??null)!==baseline){conflict=true;issue('conflict');}},
  async save(state){
   if(!this.changed(state))return false;
   const commit=()=>{
    try{
     if(failedRead||conflict||(storage.getItem(key)??null)!==baseline){conflict=true;issue('conflict');return false;}
     const data=JSON.stringify(state),value=JSON.stringify({app:'site-atlas',version:2,revision:newId(),updatedAt:new Date().toISOString(),state});
     storage.setItem(key,value);baseline=value;lastState=data;dirty=false;return true;
    }catch{issue('quota');return false;}
   };
   try{return locks?await locks.request(key,commit):commit();}catch{issue('quota');return false;}
  }
 };
}
