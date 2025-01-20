import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm"; //import D3

// d3-force-graph.js
const width = screen.width;
const height = screen.height;

const fontFamily = "Trebuchet MS";

// Load data
let graph = { nodes: [], links: [] };
let timeSlept;

loadData().then(() => {
    createGraph();
    createHistogram();
});

async function loadData() {
    await loadGraphData();
    await loadTimeSleptData();

    console.log(timeSlept);
}

function loadGraphData() {
    return Promise.all([
        d3.csv("nodes.csv"),
        d3.csv("links.csv")
    ]).then(([nodes, links]) => {
        graph = {
            nodes: nodes.map(d => ({ id: d.id })),
            links: links.map(d => ({ source: d.source, target: d.target }))
        };
    });
}

/* CSV file */
function loadTimeSleptData() {
    return d3.csv("timeSlept.csv").then(data => {
        timeSlept = data.map(d => ({
            date: d.date,
            time: d.sleep
        }));
    });
}

function createGraph() {
    // Create SVG container
    const svg = d3
    .select("#graph-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

    // Define the simulation
    const simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links).id(d => d.id).distance(60))
    .force("charge", d3.forceManyBody().strength(-150))
    .force("center", d3.forceCenter(width / 2, height / 2));

    // Add links
    const link = svg
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(graph.links)
    .enter()
    .append("line")
    .attr("stroke", "#999")
    .attr("stroke-width", 2);

    // Add nodes
    const node = svg
    .append("g")
    .attr("class", "nodes")
    .selectAll("circle")
    .data(graph.nodes)
    .enter()
    .append("circle")
    .attr("r", 10)
    .attr("fill", "steelblue")
    .call(d3.drag() // Enable drag behavior
        .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        })
        .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
        })
        .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        })
    );

    // Add labels
    const label = svg
    .append("g")
    .attr("class", "labels")
    .selectAll("text")
    .data(graph.nodes)
    .enter()
    .append("text")
    .attr("dy", -15)
    .attr("text-anchor", "middle")
    .text(d => d.id)
    .attr("fill", "black")
    .attr("font-size", "12px");

    // Update positions on each tick
    simulation.on("tick", () => {
    link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

    label
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });
}

// Histogram for time slept
function createHistogram() {
    // Set up dimensions and margins
    const margin = { top: 30, right: 30, bottom: 40, left: 40 };
    const histogramWidth = 600 - margin.left - margin.right;
    const histogramHeight = 300 - margin.top - margin.bottom;

    // Create SVG container for histogram
    const svg = d3
        .select("#histogram-container")
        .append("svg")
        .attr("width", histogramWidth + margin.left + margin.right)
        .attr("height", histogramHeight + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Set up x and y scales
    const x = d3.scaleLinear()
        .domain([d3.min(timeSlept, d => +d.time), d3.max(timeSlept, d => +d.time)])
        .range([0, histogramWidth]);

    const y = d3.scaleLinear()
        .range([histogramHeight, 0]);

    // Create histogram bins
    const histogram = d3.histogram()
        .value(d => +d.time)
        .domain(x.domain())
        // Number of bins
        .thresholds(x.ticks(20));

    const bins = histogram(timeSlept);

    // Update y scale domain
    y.domain([0, d3.max(bins, d => d.length)]);

    // Append bars to the histogram
    svg.selectAll("rect")
        .data(bins)
        .enter()
        .append("rect")
        .attr("x", 1)
        .attr("transform", d => `translate(${x(d.x0)},${y(d.length)})`)
        .attr("width", d => x(d.x1) - x(d.x0) - 1)
        .attr("height", 0)
        .style("fill", "#69b3a2")
        // Add transition
        // TODO: GOES FROM TOP TO BOTTOM, NOT BOTTOM TO TOP
        // .transition()
        // .duration(1000)
        .attr("height", d => histogramHeight - y(d.length))
        .attr("y", d => y(d.length));

    // Add x-axis
    svg.append("g")
        .attr("transform", `translate(0,${histogramHeight})`)
        .call(d3.axisBottom(x))
        .append("text")
        .attr("y", 30)
        .attr("x", histogramWidth / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .text("Time Slept (hours)")
        .style("font-family", fontFamily);

    // Add y-axis
    svg.append("g")
        .call(d3.axisLeft(y));
}