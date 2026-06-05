async function loadTopics(){
 const topics=await fetch('./questions/topics.json').then(r=>r.json());
 const grid=document.getElementById('topicsGrid');
 let total=0;
 for(const topic of topics){
   const q=await fetch(`./questions/${topic}.json`).then(r=>r.json());
   total+=q.length;
   const card=document.createElement('div');
   card.className='topic-card';
   card.innerHTML=`<h3>📚 ${topic}</h3><p>${q.length} Questions</p>`;
   grid.appendChild(card);
 }
 document.getElementById('stats').innerHTML=`Topics: ${topics.length} | Questions: ${total}`;
}
if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js');}
loadTopics();
