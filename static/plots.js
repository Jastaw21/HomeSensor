const MOCK =  false;

const key = new URLSearchParams(window.location.search).get('key');

function parseUtcTimestamp(timestamp) {
    if (!timestamp) return null;

    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp);
    return new Date(hasTimezone ? timestamp : `${timestamp}Z`);
}

const layout_base = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    autosize: true,
    font: {color: '#DBDBDB', size: 12, family: 'Roboto, sans-serif'},
    margin: {t: 10, r: 50, b: 70, l: 50},
    xaxis: {gridcolor: '#DBDBDB', linecolor: '#DBDBDB', type: 'date'},
    yaxis: {gridcolor: '#DBDBDB', linecolor: '#DBDBDB', range:[15,25] },
    yaxis2: {gridcolor: 'transparent', linecolor: '#DBDBDB', range: [20,100]},
    hovermode: 'x unified',
    legend: {
        orientation: 'h',
        x: 0.5,
        xanchor: 'center',
        y: -0.2,
        yanchor: 'top',
        bgcolor: '#222', font: {color: '#A1A1A1'}
    },
    showlegend: true,
    dragmode: false,
};
const config = {responsive: true, displayModeBar: false};

function generateMockData() {
    const now = Date.now();
    const data = [];
    for (let i = 200; i >= 0; i--) {
        data.push({
            id: i,
            temp: 20 + Math.sin(i / 20) * 4 + Math.random(),
            humidity: 55 + Math.cos(i / 15) * 8 + Math.random(),
            timestamp: new Date(now - i * 5 * 60000).toISOString(),
            sensor_id: 1,
            sensor: "living room"
        });
    }
    return data;
}

async function loadData() {
    let data;
    if (MOCK) {
        data = generateMockData();
    } else {
        document.getElementById('status').textContent = 'Loading...';
        const res = await fetch('/data', {headers: {'X-API-Key': key}});
        data = await res.json();

    }

    console.log(data[0]);

    const hours = parseInt(document.getElementById('range-filter').value);
    if (hours > 0) {
        const cutoff = new Date(Date.now() - hours * 3600000);
        data = data.filter(d => parseUtcTimestamp(d.timestamp) >= cutoff);
    }

    const sensorFilter = document.getElementById('sensor-filter').value;

    // Populate sensor dropdown
    const sensors = [...new Set(data.map(d => d.sensor || `Sensor ${d.sensor_id}`))];
    const sel = document.getElementById('sensor-filter');
    const current = sel.value;
    sel.innerHTML = '<option value="all">All sensors</option>';
    sensors.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (s === current) opt.selected = true;
        sel.appendChild(opt);
    });

    const filtered = sensorFilter === 'all' ? data
        : data.filter(d => (d.sensor || `Sensor ${d.sensor_id}`) === sensorFilter);

    // Group by sensor
    const groups = {};
    filtered.forEach(d => {
        const name = d.sensor || `Sensor ${d.sensor_id}`;
        if (!groups[name]) groups[name] = {times: [], temps: [], humids: []};
        groups[name].times.push(parseUtcTimestamp(d.timestamp)); // in local time
        groups[name].temps.push(d.temp);
        groups[name].humids.push(d.humidity);
    });

    const colors = ['#12c35a', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    let ci = 0;

    const overviewTraces = [];

    for (const [name, g] of Object.entries(groups)) {
        const col = colors[ci++ % colors.length];

        overviewTraces.push({
            x: g.times, y: g.temps, name: `${name} temp`,
            mode: 'lines', line: {color: col, width: 2},
            hovertemplate: '%{y:.1f}°C'
        });
        overviewTraces.push({
            x: g.times, y: g.humids, name: `${name} humidity`,
            mode: 'lines', line: {color: col, width: 2, dash: 'dot'},
            yaxis: 'y2', hovertemplate: '%{y:.1f}%'
        });
    }

    const overviewLayout = {
        ...layout_base,
        xaxis: {
            ...layout_base.xaxis,
            tickformat: '%H:%M',
            hoverformat: '%d %b %H:%M'
        },
        yaxis: {...layout_base.yaxis, title: '°C'},
        yaxis2: {...layout_base.yaxis2, title: '%', overlaying: 'y', side: 'right'},
    };

    Plotly.purge('chart-overview');
    Plotly.newPlot('chart-overview', overviewTraces, overviewLayout, config);


    document.getElementById('status').textContent =
        `${filtered.length} readings · updated ${new Date().toLocaleTimeString()}`;

    document.getElementById('temp-value').textContent =
        filtered.at(filtered.length - 1)?.temp?.toFixed(1) + ' C' || 'N/A';

    document.getElementById('humidity-value').textContent =
        filtered.at(filtered.length - 1)?.humidity?.toFixed(1) + ' %' || 'N/A';
}

document.getElementById('range-filter').addEventListener('change', loadData);
document.getElementById('sensor-filter').addEventListener('change', loadData);

loadData();
setInterval(loadData, 60000 * 5); // auto-refresh every 5 minutes