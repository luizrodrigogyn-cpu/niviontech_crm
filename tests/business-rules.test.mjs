import assert from 'node:assert/strict';
import {applyWonDealRules,validateNegotiation} from '../modules/pipeline.js';
import {applyReceiptRules} from '../modules/receipts.js';

const tests=[];
function test(name,run){tests.push({name,run})}

test('RB-01: negociação ativa exige próxima ação e data',()=>{
  const missingAction=validateNegotiation({next:'',nextDate:'2026-08-26'});
  const missingDate=validateNegotiation({next:'Ligar para o cliente',nextDate:''});
  const complete=validateNegotiation({next:'Ligar para o cliente',nextDate:'2026-08-26'});

  assert.equal(missingAction.valid,false);
  assert.equal(missingDate.valid,false);
  assert.equal(missingAction.message,'Toda negociação ativa precisa de próxima ação e data.');
  assert.equal(complete.valid,true);
  assert.equal(complete.message,'');
});

test('RB-04: venda ganha não significa pagamento recebido',()=>{
  const deal=applyWonDealRules({id:'deal-test',value:5000});

  assert.equal(deal.status,'won');
  assert.equal(deal.paymentStatus,'pending');
  assert.equal(deal.receivedAmount,undefined);
});

test('RB-04: recebimento só é confirmado pela regra financeira',()=>{
  const deal=applyWonDealRules({id:'deal-test',value:5000});
  applyReceiptRules(deal,{received:5000,dueDate:'2026-08-30',status:'received'});

  assert.equal(deal.status,'won');
  assert.equal(deal.paymentStatus,'received');
  assert.equal(deal.receivedAmount,5000);
});

let failures=0;
for(const {name,run} of tests){
  try{
    run();
    console.log('PASS',name);
  }catch(error){
    failures++;
    console.error('FAIL',name);
    console.error(error);
  }
}

if(failures){
  console.error(`\n${failures} teste(s) falharam.`);
  process.exitCode=1;
}else{
  console.log(`\n${tests.length} testes passaram.`);
}
