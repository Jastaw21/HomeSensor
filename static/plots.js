const MOCK = false;

const key = new URLSearchParams(window.location.search).get('key');


const layout_base = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: {color: '#1F1F1F', size: 12},
    margin: {t: 10, r: 50, b: 50, l: 50},
    xaxis: {gridcolor: '#A1A1A1', linecolor: '#A1A1A1', type: 'date'},
    yaxis: {gridcolor: '#A1A1A1', linecolor: '#A1A1A1'},
    yaxis2: {gridcolor: 'transparent', linecolor: '#A1A1A1'},
    hovermode: 'x unified',
    showlegend: false,
    //legend: {bgcolor: 'transparent', font: {color: '#EEFFF0'}, location: 'bottom right'},
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
            sensor_name: "living room"
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

    const hours = parseInt(document.getElementById('range-filter').value);
    if (hours > 0) {
        const cutoff = new Date(Date.now() - hours * 3600000);
        data = data.filter(d => new Date(d.timestamp + 'Z') >= cutoff);
    }

    const sensorFilter = document.getElementById('sensor-filter').value;

    // Populate sensor dropdown
    const sensors = [...new Set(data.map(d => d.sensor_name || `Sensor ${d.sensor_id}`))];
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
        : data.filter(d => (d.sensor_name || `Sensor ${d.sensor_id}`) === sensorFilter);

    // Group by sensor
    const groups = {};
    filtered.forEach(d => {
        const name = d.sensor_name || `Sensor ${d.sensor_id}`;
        if (!groups[name]) groups[name] = {times: [], temps: [], humids: []};
        groups[name].times.push(new Date(d.timestamp + 'Z')); // in local time
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
            mode: 'lines+markers', line: {color: col, width: 2},
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
        yaxis2: {...layout_base.yaxis2, title: '%', overlaying: 'n', side: 'right'},
    };

    Plotly.react('chart-overview', overviewTraces, overviewLayout, config);


    document.getElementById('status').textContent =
        `${filtered.length} readings · updated ${new Date().toLocaleTimeString()}`;
}

document.getElementById('range-filter').addEventListener('change', loadData);
document.getElementById('sensor-filter').addEventListener('change', loadData);

loadData();
setInterval(loadData, 60000 * 5); // auto-refresh every 5 minutes