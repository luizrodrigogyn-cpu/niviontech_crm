export const receiptsDomain=Object.freeze({name:'receipts',label:'Recebimentos'});
export function createProvisionalReceipt(deal,now=new Date()){
  const dueDate=new Date(now.getTime()+7*86400000).toISOString().slice(0,10);
  deal.receiptId=deal.receiptId||'receipt-'+deal.id;
  deal.receiptCreatedAt=deal.receiptCreatedAt||now.toISOString();
  deal.receiptProvisional=true;
  deal.paymentStatus='pending';
  deal.receivedAmount=Number(deal.receivedAmount||0);
  deal.dueDate=deal.dueDate||dueDate;
  return deal;
}
export function applyReceiptRules(deal,receipt){
  deal.value=Number(receipt.total||deal.value);
  deal.receivedAmount=Number(receipt.received);
  deal.dueDate=receipt.dueDate;
  deal.paymentStatus=receipt.status;
  deal.receiptProvisional=false;
  if(deal.receivedAmount>=Number(deal.value)){
    deal.receivedAmount=Number(deal.value);
    deal.paymentStatus='received';
  }
  return deal;
}
