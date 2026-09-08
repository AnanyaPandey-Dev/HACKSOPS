// ---------- Global state ----------
let priceData = [];
let currentChart = null;

// ---------- Page navigation ----------
const navButtons = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // remove 'active' from all buttons and pages
    navButtons.forEach(b => b.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));

    // activate the clicked one
    btn.classList.add('active');
    const pageId = btn.getAttribute('data-page');
    document.getElementById(pageId).classList.add('active');
  });
});

document.getElementById('tryDemoBtn').addEventListener('click', () => {
  navButtons.forEach(b => b.classList.remove('active'));
  pages.forEach(p => p.classList.remove('active'));
  document.querySelector('[data-page="prices"]').classList.add('active');
  document.getElementById('prices').classList.add('active');
});

// ---------- Load price data ----------
fetch('prices.json')
  .then(res => res.json())
  .then(data => {
    priceData = data;
    populateFilters();
    renderPriceCards(priceData);
    populateAdvisorCropDropdown();
  })
  .catch(err => {
    console.error('Could not load prices.json', err);
    document.getElementById('priceCards').innerHTML =
      '<p>Could not load price data. Make sure prices.json is in the same folder.</p>';
  });

// ---------- Filters ----------
function populateFilters() {
  const cropFilter = document.getElementById('cropFilter');
  const mandiFilter = document.getElementById('mandiFilter');

  const crops = [...new Set(priceData.map(d => d.crop))];
  const mandis = [...new Set(priceData.map(d => d.mandi))];

  crops.forEach(crop => {
    const opt = document.createElement('option');
    opt.value = crop;
    opt.textContent = crop;
    cropFilter.appendChild(opt);
  });

  mandis.forEach(mandi => {
    const opt = document.createElement('option');
    opt.value = mandi;
    opt.textContent = mandi;
    mandiFilter.appendChild(opt);
  });

  cropFilter.addEventListener('change', applyFilters);
  mandiFilter.addEventListener('change', applyFilters);
}

function applyFilters() {
  const crop = document.getElementById('cropFilter').value;
  const mandi = document.getElementById('mandiFilter').value;

  let filtered = priceData;
  if (crop !== 'all') filtered = filtered.filter(d => d.crop === crop);
  if (mandi !== 'all') filtered = filtered.filter(d => d.mandi === mandi);

  renderPriceCards(filtered);
}

// ---------- Price cards ----------
function renderPriceCards(data) {
  const container = document.getElementById('priceCards');
  container.innerHTML = '';

  data.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'price-card';

    const changeClass = entry.pct_change_week >= 0 ? 'change-up' : 'change-down';
    const changeSymbol = entry.pct_change_week >= 0 ? '▲' : '▼';

    card.innerHTML = `
      <h4>${entry.crop} — ${entry.mandi}</h4>
      <div class="price">₹${entry.price} / ${entry.unit}</div>
      <div class="${changeClass}">${changeSymbol} ${Math.abs(entry.pct_change_week)}% this week</div>
      <div style="font-size:0.8rem;color:#777;margin-top:6px;">${entry.state} · updated ${entry.date}</div>
    `;

    card.addEventListener('click', () => renderChart(entry));
    container.appendChild(card);
  });

  // auto-show chart for the first item
  if (data.length > 0) renderChart(data[0]);
}

// ---------- Trend chart ----------
function renderChart(entry) {
  const ctx = document.getElementById('trendChart').getContext('2d');

  const labels = entry.trend.map(p => p.date);
  const prices = entry.trend.map(p => p.price);

  if (currentChart) currentChart.destroy();

  currentChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${entry.crop} price at ${entry.mandi} (₹/quintal)`,
        data: prices,
        borderColor: '#2D6A4F',
        backgroundColor: 'rgba(45,106,79,0.1)',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } }
    }
  });
}

// ---------- AI Advisor crop dropdown ----------
function populateAdvisorCropDropdown() {
  const select = document.getElementById('advisorCrop');
  const crops = [...new Set(priceData.map(d => d.crop))];
  crops.forEach(crop => {
    const opt = document.createElement('option');
    opt.value = crop;
    opt.textContent = crop;
    select.appendChild(opt);
  });
}

// ---------- AI Advisor ----------
const GEMINI_API_KEY = "Enter API ID here"; // <-- paste your key between the quotes

document.getElementById('askAdvisorBtn').addEventListener('click', async () => {
  const crop = document.getElementById('advisorCrop').value;
  const responseBox = document.getElementById('advisorResponse');

  if (!crop) {
    alert('Please select a crop first.');
    return;
  }

  responseBox.classList.add('show');
  responseBox.innerHTML = '<p>Thinking...</p>';

  // Gather all mandi data for this crop to give the AI real context
  const cropEntries = priceData.filter(d => d.crop === crop);

  const dataSummary = cropEntries.map(e =>
    `${e.mandi} (${e.state}): ₹${e.price}/quintal, ${e.pct_change_week >= 0 ? '+' : ''}${e.pct_change_week}% this week`
  ).join('\n');

  const prompt = `You are an agricultural market advisor helping a small farmer in India.
Here is real mandi price data for ${crop} across different markets:

${dataSummary}

Based on this data, give the farmer:
1. A clear verdict: either "SELL NOW" or "HOLD"
2. Which mandi offers the best price
3. A short (2-3 sentence) plain-language explanation

Keep it simple, no jargon. Start your response with the verdict in all caps.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

        const data = await res.json();
    console.log('Full API response:', data);

    if (data.error) {
      responseBox.innerHTML = `<p><strong>API Error:</strong> ${data.error.message}</p>`;
      return;
    }

    if (!data.candidates || !data.candidates[0]) {
      responseBox.innerHTML = `<p><strong>Unexpected response:</strong> ${JSON.stringify(data)}</p>`;
      return;
    }

    const text = data.candidates[0].content.parts[0].text;

    const isSell = text.toUpperCase().includes('SELL');
    const verdictClass = isSell ? 'sell' : 'hold';
    const verdictLabel = isSell ? 'SELL NOW' : 'HOLD';

    responseBox.innerHTML = `
      <span class="verdict ${verdictClass}">${verdictLabel}</span>
      <p>${text.replace(/\n/g, '<br>')}</p>
    `;
   } catch (err) {
    console.error(err);
    responseBox.innerHTML = `<p><strong>Error:</strong> ${err.message}</p>`;
  }
});