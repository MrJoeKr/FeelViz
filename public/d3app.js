import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm"; //import D3

const fontFamily = "Trebuchet MS";

// Maximum date range
let minDate = "2024-10-10";
// let minDate = "2024-12-22";
let maxDate = "2024-12-23";

// Selected date range, used for filtering nodes in the graph
let selectedStartDate = new Date(minDate);
let selectedEndDate = new Date(maxDate);

// Selected node, used to display information
let previousNode = null;
let selectedNode = null;

// Set of all edges (links), i.e. pairs of nodes in format "node1|node2"
// Used to avoid duplicate edges
// These are then used to make the graph.links
let __links = new Set();

// Load data
let graph = { nodes: [], links: [] };

// let timeSlept; // TODO REMOVE

// node_dates is a dictionary that maps node id to a list of dates
// Important for efficient on click node information
let __node_dates = {};
// date_nodes is a dictionary that maps date to a list of nodes
// Important for efficient filtering of nodes in the graph
let __date_nodes = {};

// Filtered by start and end date
let node_dates = {};
let date_nodes = {};

// Frequency of each node
let node_count = {};
// day_stats is a dictionary date -> (mindState, timeSlept)
let day_stats = {};

// D3 areas
let graphArea;
let histogramArea;

const histogramMargin = { top: 20, right: 30, bottom: 40, left: 40 };


loadData().then(() => {
    initAreas();
    visualizeData();
});

function initAreas() {
    // Clear all areas
    graphArea = d3.select("#graph-div").append("svg")
    .attr("width", d3.select("#graph-div").node().clientWidth)
    .attr("height", d3.select("#graph-div").node().clientHeight)

    initHistogramArea();
}

function initHistogramArea() {
    histogramArea = d3.select("#histogram-div").append("svg")
    .attr("width", d3.select("#histogram-div").node().clientWidth)
    .attr("height", d3.select("#histogram-div").node().clientHeight)
    .append("g")
    .attr("transform", `translate(${histogramMargin.left},${histogramMargin.top})`);
}

function visualizeData() {
    createTimeInterval();
    makeGraph();
    createSelectedNodeText();
    drawHistogram();
}

async function loadData() {
    await loadNodes().then(() => {
        filterNodes();
    });
    await loadDayStats();
}

function loadNodes() {
    return d3.csv("nodes.csv").then(data => {
        for (let i = 0; i < data.length; i++) {
            const date_node = data[i];
            const date = date_node.date;
            const node = date_node.word;

            // Append date to node_dates
            if (__node_dates[node] === undefined) {
                __node_dates[node] = [];
            }
            __node_dates[node].push(date);

            // Append node to date_nodes
            if (__date_nodes[date] === undefined) {
                __date_nodes[date] = [];
            }
            __date_nodes[date].push(node);
        }
    });
}

function filterNodes() {
    node_dates = {};
    date_nodes = {};

    for (let date in __date_nodes) {
        let dDate = new Date(date);
        // Filter dates
        if (!(selectedStartDate <= dDate && dDate <= selectedEndDate)) {
            continue;
        }

        // Add to date_nodes
        date_nodes[date] = __date_nodes[date];

        // Update node_dates
        for (let i = 0; i < date_nodes[date].length; i++) {
            const node = date_nodes[date][i];
            if (node_dates[node] === undefined) {
                node_dates[node] = [];
            }
            node_dates[node].push(date);
        }
    } 

    loadGraphData();
}

// Load nodes and edges
function loadGraphData() {
    // Clear graph
    graph.nodes = [];
    graph.links = [];
    __links = new Set();

    // Clear node count
    node_count = {};

    // Use node_dates
    for (let date in date_nodes) {
        // Push all nodes in date_nodes[date] to graph.nodes
        for (let i = 0; i < date_nodes[date].length; i++) {
            const node = date_nodes[date][i];

            // Add node if not already in graph.nodes
            if (node_count[node] === undefined) {
                graph.nodes.push({ id: node });
                node_count[node] = 0;
            }

            // Add edges with other nodes in the same date
            for (let j = 0; j < date_nodes[date].length; j++) {
                if (i === j) {
                    continue;
                }
                const otherNode = date_nodes[date][j];
                const edge = `${node}|${otherNode}`;
                const reverseEdge = `${otherNode}|${node}`;
                if (!__links.has(edge) && !__links.has(reverseEdge)) {
                    __links.add(edge);
                    graph.links.push({ source: node, target: otherNode });
                }
            }

            // Increment node count
            node_count[node]++;
        }

    }

    // Update selected node
    if (selectedNode && node_dates[selectedNode.id] === undefined) {
        selectedNode = null;
    }

    updateSelectedNodeText();
}

/* CSV file */
function loadDayStats() {
    return d3.csv("day_stats.csv").then(data => {
        for (let i = 0; i < data.length; i++) {
            day_stats[data[i].date] = {
                mindState: data[i].mindState,
                timeSlept: data[i].sleep
            };
        }
    });
}

// Create text area for selected node
function createSelectedNodeText() {
    d3.select("#selected-node-div").append("svg")
    .attr("width", d3.select("#selected-node-div").node().clientWidth)
    .attr("height", d3.select("#selected-node-div").node().clientHeight)

    updateSelectedNodeText();
}

function updateSelectedNodeText() {
    let text;
    if (selectedNode === null) {
        text = "No node selected.";
    }
    else {
        text = "Selected Node: " + selectedNode.id + ". "
            + "Node count: " + node_count[selectedNode.id] + ".";
    }

    d3.select("#selected-node-div svg").selectAll("*").remove();
    d3.select("#selected-node-div svg").append("text")
    .attr("x", 10)
    .attr("y", 20)
    .attr("fill", "white")
    .attr("font-family", fontFamily)
    .attr("font-size", "20px")
    .text(text);
}

function makeGraph() {
    // Clear graph area
    graphArea.selectAll("*").remove();

    const graphWidth = d3.select("#graph-div").node().clientWidth;
    const graphHeight = d3.select("#graph-div").node().clientHeight;

    // Define the simulation
    const simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links).id(d => d.id).distance(60))
    .force("charge", d3.forceManyBody().strength(-150))
    .force("center", d3.forceCenter(graphWidth / 2, graphHeight / 2));

    // Add links
    const link = graphArea
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(graph.links)
    .enter()
    .append("line")
    .attr("stroke", "#999")
    .attr("stroke-width", 2);

    // Add nodes
    const node = graphArea
    .append("g")
    .attr("class", "nodes")
    .selectAll("circle")
    .data(graph.nodes)
    .enter()
    .append("circle")
    // Node radius
    .attr("r", d => node_count[d.id] * 1.2 + 10) // Set radius based on node count
    .attr("fill", "steelblue")
    .on("click", (event, d) => {
        nodeClick(d);
    })
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
    const label = graphArea
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
    .attr("font-size", d => 12 + "px");

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

function drawHistogram() {
    // Set up dimensions and margins
    const histogramWidth = d3.select("#histogram-div")
        .node().clientWidth - histogramMargin.left - histogramMargin.right;
    const histogramHeight = d3.select("#histogram-div")
        .node().clientHeight - histogramMargin.top - histogramMargin.bottom;

    // Clear histogram area 
    histogramArea.selectAll("*").remove();

    // Prepare data and set scales
    const timeSleptValues = Object.values(day_stats).map(d => +d.timeSlept);
    const x = d3.scaleLinear()
        .domain([d3.min(timeSleptValues) - 0.3, d3.max(timeSleptValues) + 0.3])
        .range([0, histogramWidth]);

    const histogram = d3.histogram()
        .value(d => d) // TimeSlept values already processed
        .domain(x.domain())
        .thresholds(x.ticks(20));

    const bins = histogram(timeSleptValues);

    const y = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length)]) // Max bin count
        .range([histogramHeight, 0]);

    // Append bars to the histogram
    histogramArea.selectAll("rect")
        .data(bins)
        .enter()
        .append("rect")
        .attr("x", d => x(d.x0) + 1) // Bar starting position
        .attr("y", histogramHeight) // Start from bottom
        .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1)) // Handle thin bars
        .attr("height", 0) // Start with height 0
        .style("fill", "#69b3a2")
        .transition()
        .duration(1000)
        .attr("y", d => y(d.length)) // Transition to final height
        .attr("height", d => histogramHeight - y(d.length)); // Transition height

    // Add x-axis
    histogramArea.append("g")
        .attr("transform", `translate(0,${histogramHeight})`) // Place at the bottom
        .call(d3.axisBottom(x));

    // Add x-axis label
    histogramArea.append("text")
        .attr("x", histogramWidth / 2)
        .attr("y", histogramHeight + histogramMargin.bottom - 2) // Below the axis
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-family", fontFamily)
        .attr("font-size", "14px")
        .text("Time Slept (hours)")

    // Add y-axis
    histogramArea.append("g")
        .call(d3.axisLeft(y));
    
    // Add y-axis label
    histogramArea.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -histogramMargin.left + 10) // Above the axis
        .attr("x", -histogramHeight / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-family", fontFamily)
        .attr("font-size", "14px")
        .text("Frequency");
}

function nodeClick(d) {
    // Update selected node
    previousNode = selectedNode;
    selectedNode = d;

    // Update node information
    updateSelectedNodeText();
}

function createTimeInterval() {
    // Initialize SVG dimensions
    const svgWidth = 1000;
    const svgHeight = 200;
    const padding = 50;

    // Create SVG
    const timeIntervalArea = d3
        .select("#time-interval-div")
        .append("svg")
        .attr("width", svgWidth)
        .attr("height", svgHeight);

    // Define time scale
    const minD = new Date(minDate);
    const maxD = new Date(maxDate);

    const xScale = d3.scaleTime()
        .domain([minD, maxD])
        .range([padding, svgWidth - padding]);

    // Draw the base line
    timeIntervalArea.append("line")
        .append("line")
            .attr("x1", xScale(minD))
            .attr("y1", svgHeight / 2)
            .attr("x2", xScale(maxD))
            .attr("y2", svgHeight / 2)
            .attr("stroke", "black")
            .attr("stroke-width", 2);

    // Add discrete points on the line
    const dates = d3.timeDays(minD, maxD);
    timeIntervalArea.selectAll("circle.point")
        .data(dates)
        .enter()
        .append("circle")
        .attr("class", "point")
        .attr("cx", d => xScale(d))
        .attr("cy", svgHeight / 2)
        .attr("r", 3)
        .attr("fill", "black");

    // Add boundary labels
    timeIntervalArea.append("text")
        .attr("x", xScale(minD))
        .attr("y", svgHeight / 2 - 20)
        .attr("text-anchor", "middle")
        .text(d3.timeFormat("%b %d, %Y")(minD));

    timeIntervalArea.append("text")
        .attr("x", xScale(maxD))
        .attr("y", svgHeight / 2 - 20)
        .attr("text-anchor", "middle")
        .text(d3.timeFormat("%b %d, %Y")(maxD));
    
    // Draggable points with snapping
    const drag = d3.drag()
        .on("drag", function(event, d) {
            // Find the closest date to the current drag position
            const mouseX = event.x;
            const snappedDate = d3.least(dates, date =>
                Math.abs(xScale(date) - mouseX)
            );

            // Start must be before end
            if (d.type === "start" && snappedDate >= selectedEndDate) {
                return;
            } else if (d.type === "end" && snappedDate <= selectedStartDate) {
                return;
            }

            // Update the dragged circle's position
            d.date = snappedDate; // Update the data-bound date
            d3.select(this)
                .attr("cx", xScale(snappedDate)); // Snap to the closest discrete point
            
            // Update text and visuals
            update(d);
        })
        .on("end", function(event, d) {
            updateSelectedDate(d); // Trigger the update event when dragging ends
        });

    function update(circle) {
        let dayDiff;
        if (circle.type === "start") {
            dayDiff = selectedEndDate - circle.date;
            updateCircleDateLabel("#start-date-label", circle.date, xScale);
        } else {
            dayDiff = circle.date - selectedStartDate;
            updateCircleDateLabel("#end-date-label", circle.date, xScale);
        }

        // Update text for number of days
        dayDiff = Math.ceil(dayDiff / (1000 * 60 * 60 * 24));
        d3.select("#dayCount").text(`${dayDiff} days`);
    }

    // Start draggable circle
    timeIntervalArea.append("circle")
        .datum({ date: selectedStartDate, type: "start" })
        .attr("cx", xScale(selectedStartDate))
        .attr("cy", svgHeight / 2)
        .attr("r", 8)
        .attr("fill", "blue")
        .call(drag);

    // Add text for start date
    const dateLabelMargin = 30;
    timeIntervalArea.append("text")
        .datum({ date: selectedStartDate, type: "start" }) // Match the circle's data
        .attr("id", "start-date-label")
        .attr("x", xScale(selectedStartDate))
        .attr("y", svgHeight / 2 + dateLabelMargin) // Place below the circle
        .attr("text-anchor", "middle")
        .attr("font-size", "13px")
        .attr("font-family", fontFamily)
        .attr("fill", "white")
        .text(d3.timeFormat("%d %b")(selectedStartDate)); // Format as "21 Dec"


    // End draggable circle
    timeIntervalArea.append("circle")
        .datum({ date: selectedEndDate, type: "end" })
        .attr("cx", xScale(selectedEndDate))
        .attr("cy", svgHeight / 2)
        .attr("r", 8)
        .attr("fill", "red")
        .call(drag);

    // Add text for end date
    timeIntervalArea.append("text")
        .datum({ date: selectedEndDate, type: "end" }) // Match the circle's data
        .attr("id", "end-date-label")
        .attr("x", xScale(selectedEndDate))
        .attr("y", svgHeight / 2 + dateLabelMargin) // Place below the circle
        .attr("text-anchor", "middle")
        .attr("font-size", "13px")
        .attr("font-family", fontFamily)
        .attr("fill", "white")
        .text(d3.timeFormat("%d %b")(selectedEndDate)); // Format as "21 Dec"

    // Add number of days text
    timeIntervalArea.append("text")
        .attr("id", "dayCount")
        .attr("x", svgWidth / 2)
        .attr("y", svgHeight / 2 - 40)
        .attr("text-anchor", "middle")
        .attr("font-size", "14px")
        .text(() => {
            const dayDiff = Math.ceil((selectedEndDate - selectedStartDate) / (1000 * 60 * 60 * 24));
            return `${dayDiff} days`;
        });
}

function updateCircleDateLabel(id, date, xScale) {
    d3.select(id)
        .attr("x", xScale(date))
        .text(d3.timeFormat("%d %b")(date));
}

// Function to be triggered after dragging
// Update the selected date and filter nodes
function updateSelectedDate(circle) {
    if (circle.type === "start") {
        selectedStartDate = circle.date;
    } else {
        selectedEndDate = circle.date;
    }

    // Filter nodes
    filterNodes();
    makeGraph();
}
