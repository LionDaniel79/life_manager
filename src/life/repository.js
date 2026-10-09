import { persistLife, validateLife } from './model.js';
import { withTimeout } from '../async-control.js';

export function createLifeRepository({ firebase, db }) {
  const ref=uid=>firebase.doc(db,'users',uid,'lifeManager','state');
  return {
    async loadLifeData(uid) {
      const snapshot=await withTimeout(()=>(firebase.getDocFromServer || firebase.getDoc)(ref(uid)),8000);
      if (!snapshot.exists()) return null;
      const state=snapshot.data().state;
      validateLife(state);
      return state;
    },
    async saveLifeData(uid, candidate, expectedRevision) {
      const state=persistLife(candidate);
      validateLife(state);
      if (new TextEncoder().encode(JSON.stringify(state)).length>800000) throw Error('목표 보관 용량이 큽니다. 백업 후 저장 구조를 확장해야 합니다. 기존 자료는 유지됩니다.');
      return firebase.runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(ref(uid));
        const revision=snapshot.exists()?snapshot.data().state?.revision:0;
        if (revision!==expectedRevision) throw Error('다른 화면에서 목표가 변경되었습니다. 입력을 복사한 뒤 취소하고 새로 불러와 주세요.');
        const next={...state,revision:revision+1};
        transaction.set(ref(uid),{state:next});
        return next;
      });
    },
  };
}
