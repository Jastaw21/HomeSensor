const MOCK = false;
const LAYOUT_BASE = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    autosize: true,
    font: {color: '#8BA99A', size: 12, family: 'Roboto, sans-serif'},
    margin: {t: 10, r: 50, b: 50, l: 50},
    xaxis: {gridcolor: '#1F4A4A', linecolor: '#1F4A4A', type: 'date'},
    yaxis: {gridcolor: '#1F4A4A', linecolor: '#1F4A4A', range: [15, 25]},
    yaxis2: {gridcolor: 'transparent', linecolor: '#1F4A4A', range: [20, 90]},
    hovermode: 'x unified',
    legend: {
        orientation: 'h',
        x: 0.5,
        xanchor: 'center',
        y: -0.2,
        yanchor: 'top',
        bgcolor: '#06110B', font: {color: ' #8BA99A'}
    },
    showlegend: true,
    dragmode: false,
};
const PLOT_CONFIG = {responsive: true, displayModeBar: false};
const key = new URLSearchParams(window.location.search).get('key');
const DAILY_GRAPH_FILL_COLOUR = 'rgba(18, 195, 90, 0.16)';

const INITIAL_DAILY_AXIS_LIMITS = {
    tempMinAxis: 0.0,
    tempMaxAxis: 40.0,
    humidityMinAxis: 101.0,
    humidityMaxAxis: 0.0
};

// Helpers
function redrawPlot(elementName,traces,layout){
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

    return data;
}

// Data getting
async function fetchRecordData() {
    const res = await fetch(`/records`, {
        headers: {'X-API-Key': key}
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch record: ${res.status}`);
    }

    return await res.json();
}

async function fetchDailyData() {
    let data;
    if (MOCK) {
        data = generateMockDailyData();
    } else {
        document.getElementById('status').textContent = 'Loading...';
        const res = await fetch('/data/daily', {headers: {'X-API-Key': key}});
        data = await res.json();
    }
    return data;
}

async function fetchHighResData() {
    let data;
    if (MOCK) {
        data = generateMockHighResData();
    } else {
        document.getElementById('status').textContent = 'Loading...';
        const res = await fetch('/data/granular', {headers: {'X-API-Key': key}});
        data = await res.json();
    }

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

    return sensorFilter === 'all' ? data
        : data.filter(d => (d.sensor || `Sensor ${d.sensor_id}`) === sensorFilter);
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

// fetches the most upto date records, and calls the updateRecords function
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

// updates the min and max values seen so far, when building the daily graphs
function updateSensorRanges(minTemp, g, maxTemp, minHumidity, maxHumidity) {
    minTemp = Math.min(minTemp, Math.min(...g.min_temps));
    maxTemp = Math.max(maxTemp, Math.max(...g.max_temps));
    minHumidity = Math.min(minHumidity, Math.min(...g.min_humids));
    maxHumidity = Math.max(maxHumidity, Math.max(...g.max_humids));
    return {minTemp, maxTemp, minHumidity, maxHumidity};
}

// Updates the daily level summary graphs for temps and humid ranges
async function drawDailyGraph(sensorData) {

    const averageLineColour = '#12c35a';

    // apply the grouping by sensor level
    const groups = {};
    sensorData.forEach(d => {
        const name = d.sensor || 'Sensor ' + d.sensor_id;
        if (!groups[name]) groups[name] = {
            times: [],
            min_temps: [],
            max_temps: [],
            avg_temps: [],
            min_humids: [],
            max_humids: [],
            avg_humids: []
        };
        groups[name].times.push(parseUtcTimestamp(d.timestamp));
        groups[name].min_temps.push(d.temp_min);
        groups[name].max_temps.push(d.temp_max);
        groups[name].avg_temps.push(d.temp_avg);
        groups[name].min_humids.push(d.humidity_min);
        groups[name].max_humids.push(d.humidity_max);
        groups[name].avg_humids.push(d.humidity_avg);
    })


    // initial axis limits - should exceed any actual reading on both sides
    let {minTemp, maxTemp, minHumidity, maxHumidity} = INITIAL_DAILY_AXIS_LIMITS;

    const tempTraces = [];
    const humidityTraces = [];

    for (const [name, g] of Object.entries(groups)) {

        // update the most extreme values seen so far
        const cSR = updateSensorRanges(minTemp, g, maxTemp, minHumidity, maxHumidity);
        minTemp = cSR.minTemp;
        maxTemp = cSR.maxTemp;
        minHumidity = cSR.minHumidity;
        maxHumidity = cSR.maxHumidity;


        // low temp
        tempTraces.push({
            x: g.times, y: g.min_temps, name: `${name} min C`,
            mode: 'lines', line: {color: '#000', width: 0},
            showlegend: false,
            hoverinfo: 'skip'
        });

        // high temp
        tempTraces.push({
            x: g.times, y: g.max_temps, name: `${name} max C`,
            mode: 'lines', line: {color: '#000', width: 0},
            fill: 'tonexty',
            fillcolor: DAILY_GRAPH_FILL_COLOUR,
            showlegend: false,
            hoverinfo: 'skip'
        });
        // avg temp
        tempTraces.push({
            x: g.times, y: g.avg_temps, name: `${name} avg temp`,
            mode: 'lines', line: {color: averageLineColour, width: 2},
        });

        // low humidity
        humidityTraces.push({
            x: g.times, y: g.min_humids, name: `${name} min %`,
            mode: 'lines', line: {color: '#000', width: 0},
            showlegend: false,
            hoverinfo: 'skip'
        });
        // high humidity
        humidityTraces.push({
            x: g.times, y: g.max_humids, name: `${name} max %`,
            mode: 'lines', line: {color: '#000', width: 0},
            fill: 'tonexty',
            fillcolor: DAILY_GRAPH_FILL_COLOUR,
            showlegend: false,
            hoverinfo: 'skip'
        })

        // avg humidity
        humidityTraces.push({
            x: g.times, y: g.avg_humids, name: `${name} avg humidity`,
            mode: 'lines', line: {color: averageLineColour, width: 2}
        })


    }

    let {
        tempMinAxis,
        tempMaxAxis,
        humidityMinAxis,
        humidityMaxAxis
    } = generateAxisLimits(maxTemp, minTemp, maxHumidity, minHumidity);

    const tempsGraphLayout = {
        ...LAYOUT_BASE,
        xaxis:
            {
                ...LAYOUT_BASE.xaxis,
                tickformat: '%H:%M\n%d %b',
                hoverformat: '%d %b %H:%M'
            },
        yaxis: {...LAYOUT_BASE.yaxis, title: '°C', range: [tempMinAxis, tempMaxAxis]},
    }

    const humidsGraphLayout = {
        ...LAYOUT_BASE,
        xaxis:
            {
                ...LAYOUT_BASE.xaxis,
                tickformat: '%H:%M\n%d %b',
                hoverformat: '%d %b %H:%M'
            },
        yaxis: {...LAYOUT_BASE.yaxis, title: '%', range: [humidityMinAxis, humidityMaxAxis]},
    }

    // rebuil the grapha
    redrawPlot('daily-graph', tempTraces, tempsGraphLayout);
    redrawPlot('daily-humidity-graph', humidityTraces, humidsGraphLayout);
}

async function drawHighResGraph(filtered) {

    // Group by sensor
    const groups = {};
    filtered.forEach(d => {
        const name = d.sensor || `Sensor ${d.sensor_id}`;
        if (!groups[name]) groups[name] = {times: [], temps: [], humids: []};
        groups[name].times.push(parseUtcTimestamp(d.timestamp)); // in local time
        groups[name].temps.push(d.temp);
        groups[name].humids.push(d.humidity);
    });

    const colors = ['#12c35a', '#10b981', '#38BDF8', '#ef4444', '#8b5cf6'];
    let ci = 0;

    const traces = [];

    let minTemp = 40.0;
    let maxTemp = 0.0;
    let minHumidity = 101.0;
    let maxHumidity = 0.0;

    for (const [name, g] of Object.entries(groups)) {
        const col = colors[ci++ % colors.length];
        const col2 = colors[2];

        minTemp = Math.min(minTemp, Math.min(...g.temps));
        maxTemp = Math.max(maxTemp, Math.max(...g.temps));
        minHumidity = Math.min(minHumidity, Math.min(...g.humids));
        maxHumidity = Math.max(maxHumidity, Math.max(...g.humids));

        traces.push({
            x: g.times, y: g.temps, name: `${name} temp`,
            mode: 'lines', line: {color: col, width: 2},
            hovertemplate: '%{y:.1f}°C'
        });
        traces.push({
            x: g.times, y: g.humids, name: `${name} humidity`,
            mode: 'lines', line: {color: col2, width: 2, dash: 'dot'},
            yaxis: 'y2', hovertemplate: '%{y:.1f}%'
        });
    }

    let {
        tempMinAxis,
        tempMaxAxis,
        humidityMinAxis,
        humidityMaxAxis
    } = generateAxisLimits(maxTemp, minTemp, maxHumidity, minHumidity);

    const layout = {
        ...LAYOUT_BASE,
        xaxis: {
            ...LAYOUT_BASE.xaxis,
            tickformat: '%H:%M\n%d %b',
            hoverformat: '%d %b %H:%M'
        },
        yaxis: {...LAYOUT_BASE.yaxis, title: '°C', range: [tempMinAxis, tempMaxAxis]},
        yaxis2: {
            ...LAYOUT_BASE.yaxis2,
            title: '%',
            overlaying: 'y',
            side: 'right',
            range: [humidityMinAxis, humidityMaxAxis]
        },
    };

    Plotly.purge('chart-overview');
    Plotly.newPlot('chart-overview', traces, layout, PLOT_CONFIG);
}




async function runPage() {

    // get all data
    const data = await fetchHighResData();
    const dailyData = await fetchDailyData();

    // draw the top frame, the graph with 5 minute-ly data
    await drawHighResGraph(data);
    await drawDailyGraph(dailyData);

    // top readings
    updateLatestReadings(data);

    // all time records
    await updateRecords();
}

// run on startup
document.getElementById('range-filter').addEventListener('change', runPage);
document.getElementById('sensor-filter').addEventListener('change', runPage);
window.runPage = runPage;
runPage();
setInterval(runPage, 60000 * 5); // auto-refresh every 5 minutes
