const MOCK = true;


const bodyStyle = window.getComputedStyle(document.body);
const muted = bodyStyle.getPropertyValue('--muted');
const border = bodyStyle.getPropertyValue('--border');


const LAYOUT_BASE = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    autosize: true,
    font: {color: muted, size: 12, family: 'Roboto, sans-serif'},
    margin: {t: 25, r: 25, b: 25, l: 25},
    xaxis: {gridcolor: 'transparent', linecolor: border, type: 'date'},
    yaxis: {gridcolor:  border, linecolor: border, range: [15, 25]},
    yaxis2: {gridcolor: 'transparent', linecolor: border, range: [20, 90]},
    hovermode: 'x unified',
    legend: {
        orientation: 'h',
        x: 0.5,
        xanchor: 'center',
        y: -0.15,
        yanchor: 'top',
        font: {color: muted}
    },
    showlegend: true,
    dragmode: false,
};
const PLOT_CONFIG = {responsive: true, displayModeBar: false};
const key = new URLSearchParams(window.location.search).get('key');
const COLORS = ['#125FC3', '#38BDF8', '#F59E0B', '#EF4444', '#8B5CF6', '#12C35A'];
const DAILY_GRAPH_FILL_COLOUR = 'rgba(14, 122, 212, 0.16)';

const INITIAL_DAILY_AXIS_LIMITS = {
    minTemp: 40.0,
    maxTemp: 0.0,
    minHumidity: 101.0,
    maxHumidity: 0.0
};

// Helpers
async function apiFetch(url, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    const res = await fetch(fullUrl, { headers: { 'X-API-Key': key } });
    if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
    return res.json();
}

function getSensorName(sensor) {
    return sensor.name || `Sensor ${sensor.id}`;
}

function groupDataBySensor(data) {
    return data.reduce((acc, d) => {
        const name = getSensorName(d.sensor);
        if (!acc[name]) acc[name] = { id: d.sensor.id, data: [] };
        acc[name].data.push(d);
        return acc;
    }, {});
}

function getLayout(overrides = {}) {
    const layout = JSON.parse(JSON.stringify(LAYOUT_BASE));
    const deepMerge = (target, source) => {
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    };
    deepMerge(layout, overrides);
    return layout;
}

const COMMON_XAXIS = {
    tickformat: '%H:%M\n%d %b',
    hoverformat: '%d %b %H:%M'
};

function redrawPlot(elementName, traces, layout) {
    Plotly.purge(elementName);
    Plotly.newPlot(elementName, traces, layout, PLOT_CONFIG);
}

function generateAxisLimits(maxTemp, minTemp, maxHumidity, minHumidity) {
    let tempRange = maxTemp - minTemp;
    let humidityRange = maxHumidity - minHumidity;

    if (tempRange < 10) tempRange = 10; // clamp to 10 deg
    if (humidityRange < 30) humidityRange = 30;

    let tempMinAxis = minTemp - tempRange * 0.15;
    let tempMaxAxis = maxTemp + tempRange * 0.15;

    let humidityMinAxis = minHumidity - humidityRange * 0.15;
    let humidityMaxAxis = maxHumidity + humidityRange * 0.15;
    return {tempMinAxis, tempMaxAxis, humidityMinAxis, humidityMaxAxis};
}

function parseUtcTimestamp(timestamp) {
    if (!timestamp) return null;

    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp);
    return new Date(hasTimezone ? timestamp : `${timestamp}Z`);
}


// Data mockers for local testing
function generateMockHighResData() {
    const now = Date.now();
    const data = [];
    for (let i = 200; i >= 0; i--) {
        data.push({
            id: i,
            temp: 20 + Math.sin(i / 20) * 4 + Math.random(),
            humidity: 55 + Math.cos(i / 15) * 8 + Math.random(),
            timestamp: new Date(now - i * 30 * 60000).toISOString(),
            sensor_id: 1,
            sensor: "living room"
        });
    }
    return data;
}

function generateMockDailyData() {
    console.log("generating mock data");
    const now = Date.now();
    const data = [];
    for (let i = 24; i >= 0; i--) {
        data.push({
            id: i,
            temp_avg: 20 + Math.sin(i / 20) * 4 + Math.random(),
            temp_max: 26 + Math.sin(i / 20) * 4 + Math.random(),
            temp_min: 16 + Math.sin(i / 20) * 4 + Math.random(),
            humidity_avg: 55 + Math.cos(i / 15) * 8 + Math.random(),
            humidity_max: 65 + Math.cos(i / 15) * 8 + Math.random(),
            humidity_min: 45 + Math.cos(i / 15) * 8 + Math.random(),
            timestamp: new Date(now - i * (3600000 * 24)).toISOString(),
            sensor_id: 1,
            sensor: "living room"
        })
    }
    console.log(data);
    for (let i = 24; i >= 0; i--) {
        data.push({
            id: i,
            temp_avg: 20 + Math.sin(i / 20) * 4 + Math.random(),
            temp_max: 26 + Math.sin(i / 20) * 4 + Math.random(),
            temp_min: 16 + Math.sin(i / 20) * 4 + Math.random(),
            humidity_avg: 55 + Math.cos(i / 15) * 8 + Math.random(),
            humidity_max: 65 + Math.cos(i / 15) * 8 + Math.random(),
            humidity_min: 45 + Math.cos(i / 15) * 8 + Math.random(),
            timestamp: new Date(now - i * (3600000 * 24)).toISOString(),
            sensor_id: 2,
            sensor: "front-room"
        })
    }

    return data;
}

// Data getting
async function fetchRecordData() {
    return apiFetch('/records');
}

async function fetchDailyData() {
    let data;
    if (MOCK) {
        data = generateMockDailyData();
    } else {
        document.getElementById('status').textContent = 'Loading...';
        data = await apiFetch('/data/daily');
    }

    const sensorFilter = document.getElementById('sensor-filter').value;
    updateSensorFilter(data);

    return sensorFilter === 'all' ? data
        : data.filter(d => getSensorName(d.sensor) === sensorFilter);
}

function updateSensorFilter(sensorData) {
    const sensors = [...new Set(sensorData.map(d => getSensorName(d.sensor)))];
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
}

async function fetchHighResData() {
    let data;
    if (MOCK) {
        data = generateMockHighResData();
    } else {
        document.getElementById('status').textContent = 'Loading...';
        data = await apiFetch('/data/consol', { hours: '8735' });
    }

    const hours = parseInt(document.getElementById('range-filter').value);
    if (hours > 0) {
        const cutoff = new Date(Date.now() - hours * 3600000);
        data = data.filter(d => parseUtcTimestamp(d.timestamp) >= cutoff);
    }

    const sensorFilter = document.getElementById('sensor-filter').value;
    updateSensorFilter(data);

    return sensorFilter === 'all' ? data
        : data.filter(d => getSensorName(d.sensor) === sensorFilter);
}

// page updaters
function updateLatestReadings(data) {
    if (!data || data.length === 0) return;

    document.getElementById('status').textContent =
        `${data.length} readings · updated ${new Date().toLocaleTimeString()}`;

    const latest = data.at(0); // data is ordered by timestamp desc
    document.getElementById('temp-value').textContent =
        latest.temp?.toFixed(1) + ' C' || 'N/A';
    document.getElementById('humidity-value').textContent =
        latest.humidity?.toFixed(1) + ' %' || 'N/A';

    const rawTime = latest.timestamp;
    const formattedTime = rawTime ? parseUtcTimestamp(rawTime).toLocaleTimeString() : 'N/A';
    document.getElementById('timestamp-value').textContent =
        formattedTime || 'N/A';
}

// fetches the most up to date records and calls the updateRecords function
async function updateRecords() {
    const records = await fetchRecordData();
    updateRecordsCards(
        records.find(r => r.type === 'high_temp')
        , records.find(r => r.type === 'low_temp')
        , records.find(r => r.type === 'high_humidity')
        , records.find(r => r.type === 'low_humidity')
    )
}

// applies the updated record values to the relevant cards in the page
function updateRecordsCards(highestTemp, lowestTemp, highestHumidity, lowestHumidity) {
    document.getElementById('record-high-value').textContent =
        highestTemp?.value?.toFixed(1) + ' C' || 'N/A';
    document.getElementById('record-ht-date').textContent =
        highestTemp?.timestamp ? parseUtcTimestamp(highestTemp.timestamp).toLocaleString() : 'N/A';

    document.getElementById('record-low-value').textContent =
        lowestTemp?.value?.toFixed(1) + ' C' || 'N/A';
    document.getElementById('record-lt-date').textContent =
        lowestTemp?.timestamp ? parseUtcTimestamp(lowestTemp.timestamp).toLocaleString() : 'N/A';

    document.getElementById('record-high-h-value').textContent =
        highestHumidity?.value?.toFixed(1) + ' %' || 'N/A';
    document.getElementById('record-hh-date').textContent =
        highestHumidity?.timestamp ? parseUtcTimestamp(highestHumidity.timestamp).toLocaleString() : 'N/A';

    document.getElementById('record-low-h-value').textContent =
        lowestHumidity?.value?.toFixed(1) + ' %' || 'N/A';
    document.getElementById('record-lh-date').textContent =
        lowestHumidity?.timestamp ? parseUtcTimestamp(lowestHumidity.timestamp).toLocaleString() : 'N/A';
}

// Updates the daily level summary graphs for temps and humid ranges
async function drawDailyGraph(sensorData) {
    const groups = groupDataBySensor(sensorData);
    let { minTemp, maxTemp, minHumidity, maxHumidity } = INITIAL_DAILY_AXIS_LIMITS;

    const tempTraces = [];
    const humidityTraces = [];

    for (const [name, g] of Object.entries(groups)) {
        const times = g.data.map(d => parseUtcTimestamp(d.timestamp));
        const minT = g.data.map(d => d.temp_min);
        const maxT = g.data.map(d => d.temp_max);
        const avgT = g.data.map(d => d.temp_avg);
        const minH = g.data.map(d => d.humidity_min);
        const maxH = g.data.map(d => d.humidity_max);
        const avgH = g.data.map(d => d.humidity_avg);

        minTemp = Math.min(minTemp, ...minT);
        maxTemp = Math.max(maxTemp, ...maxT);
        minHumidity = Math.min(minHumidity, ...minH);
        maxHumidity = Math.max(maxHumidity, ...maxH);

        const thisColour = COLORS[(g.id - 1) % COLORS.length];

        // low temp
        tempTraces.push({
            x: times, y: minT, name: `${name} min C`,
            mode: 'lines', line: { color: '#000', width: 0 },
            showlegend: false,
            hoverinfo: 'skip'
        });

        // high temp
        tempTraces.push({
            x: times, y: maxT, name: `${name} max C`,
            mode: 'lines', line: { color: '#000', width: 0 },
            fill: 'tonexty',
            fillcolor: DAILY_GRAPH_FILL_COLOUR,
            showlegend: false,
            hoverinfo: 'skip'
        });
        // avg temp
        tempTraces.push({
            x: times, y: avgT, name: `${name} avg temp`,
            mode: 'lines', line: { color: thisColour, width: 2 },
        });

        // low humidity
        humidityTraces.push({
            x: times, y: minH, name: `${name} min %`,
            mode: 'lines', line: { color: '#000', width: 0 },
            showlegend: false,
            hoverinfo: 'skip'
        });
        // high humidity
        humidityTraces.push({
            x: times, y: maxH, name: `${name} max %`,
            mode: 'lines', line: { color: '#000', width: 0 },
            fill: 'tonexty',
            fillcolor: DAILY_GRAPH_FILL_COLOUR,
            showlegend: false,
            hoverinfo: 'skip'
        })

        // avg humidity
        humidityTraces.push({
            x: times, y: avgH, name: `${name} avg humidity`,
            mode: 'lines', line: { color: thisColour, width: 2 }
        })
    }

    const limits = generateAxisLimits(maxTemp, minTemp, maxHumidity, minHumidity);
    
    redrawPlot('daily-graph', tempTraces, getLayout({
        xaxis: COMMON_XAXIS,
        yaxis: { range: [limits.tempMinAxis, limits.tempMaxAxis] }
    }));
    
    redrawPlot('daily-humidity-graph', humidityTraces, getLayout({
        xaxis: COMMON_XAXIS,
        yaxis: { range: [limits.humidityMinAxis, limits.humidityMaxAxis] }
    }));
}

async function drawHighResGraph(filtered) {
    const groups = groupDataBySensor(filtered);
    let { minTemp, maxTemp, minHumidity, maxHumidity } = INITIAL_DAILY_AXIS_LIMITS;

    const traces = [];

    for (const [name, g] of Object.entries(groups)) {
        const times = g.data.map(d => parseUtcTimestamp(d.timestamp));
        const temps = g.data.map(d => d.temp);
        const humids = g.data.map(d => d.humidity);

        minTemp = Math.min(minTemp, ...temps);
        maxTemp = Math.max(maxTemp, ...temps);
        minHumidity = Math.min(minHumidity, ...humids);
        maxHumidity = Math.max(maxHumidity, ...humids);

        const col = COLORS[(g.id - 1) % COLORS.length];

        traces.push({
            x: times, y: temps, name: `${name} temp`,
            mode: 'lines', line: { color: col, width: 2 },
            hovertemplate: '%{y:.1f}°C'
        });
        traces.push({
            x: times, y: humids, name: `${name} humidity`,
            mode: 'lines', line: { color: col, width: 2, dash: 'dot' },
            yaxis: 'y2', hovertemplate: '%{y:.1f}%'
        });
    }

    const limits = generateAxisLimits(maxTemp, minTemp, maxHumidity, minHumidity);

    const layout = getLayout({
        xaxis: COMMON_XAXIS,
        yaxis: { range: [limits.tempMinAxis, limits.tempMaxAxis] },
        yaxis2: {
            overlaying: 'y',
            side: 'right',
            range: [limits.humidityMinAxis, limits.humidityMaxAxis]
        }
    });

    redrawPlot('chart-overview', traces, layout);
}


async function runPage() {

    // get all data
    const data = await fetchHighResData();
    const dailyData = await fetchDailyData();

    // draw the top frame, the graph with 5 minutely data
    await drawHighResGraph(data);
    await drawDailyGraph(dailyData);

    // top readings
    updateLatestReadings(data);

    // all-time records
    await updateRecords();
}

// run on startup
document.getElementById('range-filter').addEventListener('change', runPage);
document.getElementById('sensor-filter').addEventListener('change', runPage);
window.runPage = runPage;
runPage();
setInterval(runPage, 60000 * 5); // auto-refresh every 5 minutes
