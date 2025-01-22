import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm"; //import D3

const fontFamily = "Trebuchet MS";

// Maximum date range
// let minDate = "2024-10-10";
let minDate = "2024-12-10";
// Last date is not included in the range
let maxDate = "2024-12-24";

// Selected date range, used for filtering nodes in the graph
let selectedStartDate = new Date(minDate);
// It is the maxDate - 1 day
let selectedEndDate = new Date(new Date(maxDate).setDate(new Date(maxDate).getDate() - 1));

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
// node -> color. The most common mindState color of the node
let node_color = {};
// node -> d3.symbol shape
let node_shape = {};

// Frequency of each node
let node_count = {};
// day_stats is a dictionary date -> (mindState, timeSlept)
let day_stats = {};

// D3 areas
let graphArea;
let histogramArea;
let pieChartArea;

const histogramMargin = { top: 20, right: 30, bottom: 40, left: 40 };

// MindState to word mapping
const MINDSTATE_NUMS = {
    "-3": { "name": "Very Unpleasant", "color": "#3B35A2" },
    "-2": { "name": "Unpleasant", "color": "#357DD2" },
    "-1": { "name": "Slightly Unpleasant", "color": "#7899C5" },
     "0": { "name": "Neutral", "color": "#79BBCB" },
     "1": { "name": "Slightly Pleasant", "color": "#8ED433"},
     "2": { "name": "Pleasant", "color": "#F2C724"},
     "3": { "name": "Very Pleasant", "color": "#EB8F31" }
};

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
    initPieChartArea();
}

function initHistogramArea() {
    histogramArea = d3.select("#histogram-div").append("svg")
    .attr("width", d3.select("#histogram-div").node().clientWidth)
    .attr("height", d3.select("#histogram-div").node().clientHeight)
    .append("g")
    .attr("transform", `translate(${histogramMargin.left},${histogramMargin.top})`);
}

function initPieChartArea() {
    const width = d3.select("#piechart-div").node().clientWidth;
    const height = d3.select("#piechart-div").node().clientHeight;

    pieChartArea = d3.select("#piechart-div").append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr('transform', `translate(${width / 2}, ${height / 2})`);
}

function visualizeData() {
    createTimeInterval();
    drawGraph();
    createSelectedNodeText();
    drawHistogram();
    drawPieChart();
}

async function loadData() {
    await loadDayStats();
    await loadNodes().then(() => {
        filterNodes();
    });
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

            // Add shape to node_shape
            const type = date_node.type;

            if (type === "association") {
                node_shape[node] = d3.symbolStar;
            } else if (type === "context") {
                node_shape[node] = d3.symbolCircle;
            } else if (type === "description") {
                node_shape[node] = d3.symbolSquare;
            } else {
                console.log("Error: unknown node type: " + type);
            }
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

    // Update colors of the nodes
    setNodeColors();
}

function setNodeColors() {
    // Counter of mindStates for each node
    // node -> { mindState -> frequency }
    let node_mindStates = {};
    // Reset all node colors
    node_color = {};

    // Loop through all nodes
    for (let node in node_dates) {
        // Initialize mindState counter
        node_mindStates[node] = {};
        for (let key in MINDSTATE_NUMS) {
            node_mindStates[node][key] = 0;
        }

        // Loop through all dates
        for (let i = 0; i < node_dates[node].length; i++) {
            const date = node_dates[node][i];
            const mindState = day_stats[date].mindState;
            // Increment mindState counter
            node_mindStates[node][mindState]++;
        }

        // Get the most common mindState
        let maxMindState = "-3";
        for (let key in MINDSTATE_NUMS) {
            if (node_mindStates[node][key] > node_mindStates[node][maxMindState]) {
                maxMindState = key;
            }
        }

        if (maxMindState === "-3") {
            console.log("Error: maxMindState is -3");
        }

        // Set the color of the node
        const color = MINDSTATE_NUMS[maxMindState].color;
        node_color[node] = color;
    }
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
            + "Node count: " + node_count[selectedNode.id]
            + " out of " + getSelectedDatesDiff() + " days.";
    }

    d3.select("#selected-node-div svg").selectAll("*").remove();
    d3.select("#selected-node-div svg").append("text")
    .attr("x", 10)
    .attr("y", 20)
    .attr("fill", "white")
    .attr("font-family", fontFamily)
    .attr("font-size", "15px")
    .text(text);
}

function drawGraph() {
    // Clear graph area
    graphArea.selectAll("*").remove();

    const graphWidth = d3.select("#graph-div").node().clientWidth;
    const graphHeight = d3.select("#graph-div").node().clientHeight;

    // Define the simulation
    const simulation = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.links).id(d => d.id).distance(40))
    .force("charge", d3.forceManyBody().strength(-50))
    .force("center", d3.forceCenter(graphWidth / 2, graphHeight / 2));

    // Add links
    const link = graphArea
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(graph.links)
    .enter()
    .append("line")
    .attr("stroke", "#D4D7DB")
    .attr("stroke-width", 1);

    const node = graphArea
        .selectAll(".node")
        .data(graph.nodes)
        .enter()
        .append("path")
        .attr("d", d3.symbol()
            .type(d => node_shape[d.id])
            .size(d => node_count[d.id] * 20) // Set size based on node count
        )
        .attr("fill", d => node_color[d.id])
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
        .attr("font-size", d => 6 + "px");

    // Update positions on each tick
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("transform", d => `translate(${d.x},${d.y})`);

        label
            .attr("x", d => d.x)
            .attr("y", d => d.y);
    });
}

// Select timeSlept values according to the selected date range
// and selected node
// Return an array of timeSlept values
function selectTimeSleptValues() {
    let timeSleptValues = [];
    if (selectedNode === null) {
        // Select all times from start to end date
        for (let date in date_nodes) {
            const dDate = new Date(date);
            if (selectedStartDate <= dDate && dDate <= selectedEndDate) {
                timeSleptValues.push(parseFloat(day_stats[date].timeSlept));
            }
        }
    } else {
        // Select times from selected node
        for (let i = 0; i < node_dates[selectedNode.id].length; i++) {
            const date = node_dates[selectedNode.id][i];
            const dDate = new Date(date);
            if (selectedStartDate <= dDate && dDate <= selectedEndDate) {
                timeSleptValues.push(parseFloat(day_stats[date].timeSlept, 10));
            }
        }
    }

    return timeSleptValues;
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
    const timeSleptValues = selectTimeSleptValues();
    const x = d3.scaleLinear()
        .domain([d3.min(timeSleptValues) - 0.3, d3.max(timeSleptValues) + 0.3])
        .range([0, histogramWidth]);

    const histogram = d3.histogram()
        .value(d => d) // TimeSlept values already processed
        .domain(x.domain())
        .thresholds(x.ticks(20));

    const bins = histogram(timeSleptValues);

    const y = d3.scaleLinear()
        // .domain([0, d3.max(bins, d => d.length)]) // Max bin count
        .domain([0, getSelectedDatesDiff()]) // Max bin count
        .range([histogramHeight, 0]);

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

    // Do not draw if no data
    if (timeSleptValues.length === 0) {
        return;
    }

    const tooltip = getToolTip();
 
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

    // Add tooltip on hover
    histogramArea.selectAll("rect")
        .on('mouseover', function (event, d) {
            // Tooltip logic on hover
            tooltip.transition().duration(200).style('opacity', 1);
            tooltip.html(`${d.length}/${getSelectedDatesDiff()} days `
                + `<br> ${d.x0.toFixed(1)} - ${d.x1.toFixed(1)} hours`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 20) + 'px');
            d3.select(this).transition().duration(200).attr('transform', 'scale(1.01)');
        })
        .on('mouseout', function () {
            // Tooltip hide logic
            tooltip.transition().duration(200).style('opacity', 0);
            d3.select(this).transition().duration(200).attr('transform', 'scale(1)');
        })
}

// Return a counter of mindState -> frequency in the selected date range
function getMindStateValues() {
    let mindStateValues = {};
    if (selectedNode === null) {
        // Select all times from start to end date from day_stats
        // Loop through all dates in [selectedStartDate, selectedEndDate]
        for (let date = new Date(selectedStartDate); 
                date <= selectedEndDate; date.setDate(date.getDate() + 1)) {

            // Transform date to string in format "YYYY-MM-DD"
            const dateString = date.toISOString().split('T')[0];

            // Check if date exists in day_stats
            if (day_stats[dateString] !== undefined) {
                const mindState = day_stats[dateString].mindState;
                // Add to mindStateValues
                if (mindStateValues[mindState] === undefined) {
                    mindStateValues[mindState] = 0;
                }
                mindStateValues[mindState]++;
            }
        }
    } else {
        // Select times from selected node
        for (let i = 0; i < node_dates[selectedNode.id].length; i++) {
            const date = node_dates[selectedNode.id][i];
            const dDate = new Date(date);
            if (selectedStartDate <= dDate && dDate <= selectedEndDate) {
                const mindState = day_stats[date].mindState;
                // Add to mindStateValues
                if (mindStateValues[mindState] === undefined) {
                    mindStateValues[mindState] = 0;
                }
                mindStateValues[mindState]++;
            }
        }
    }

    // Make into an array of objects
    // with key "category" and value "value"
    mindStateValues = Object.keys(mindStateValues).map(key => {
        return { 
            category: MINDSTATE_NUMS[key].name,
            value: mindStateValues[key],
            color: MINDSTATE_NUMS[key].color
        };
    });

    return mindStateValues;
}

function drawPieChart() {
    // Clear pie chart area
    pieChartArea.selectAll("*").remove();

    // Data for the pie chart
    const mindStateData = getMindStateValues();

    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    // Chart dimensions
    const width = d3.select("#piechart-div")
        .node().clientWidth - margin.left - margin.right;
    const height = d3.select("#piechart-div")
        .node().clientHeight - margin.top - margin.bottom;

    const radius = Math.min(width, height) / 2;

    // Create the pie generator
    const pie = d3.pie()
        .value(d => d.value);

    // Create the arc generator
    const arc = d3.arc()
        .innerRadius(70) // For a hole in the middle
        .outerRadius(radius);

    // Create a tooltip
    const tooltip = getToolTip();

    // Bind data to pie slices
    const slices = pieChartArea.selectAll('path')
        .data(pie(mindStateData))
        .enter()
        .append('path')
        .attr('d', arc)
        .attr('fill', d => d.data.color) // Use `color` from data
        .attr('stroke', 'white')
        .style('stroke-width', '2px')
        .on('mouseover', function (event, d) {
            // Tooltip logic on hover
            tooltip.transition().duration(200).style('opacity', 1);
            tooltip.html(`${d.data.value}/${getSelectedDatesDiff()} days`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 20) + 'px');
            d3.select(this).transition().duration(200).attr('transform', 'scale(1.08)');
        })
        .on('mouseout', function () {
            // Tooltip hide logic
            tooltip.transition().duration(200).style('opacity', 0);
            d3.select(this).transition().duration(200).attr('transform', 'scale(1)');
        });

    // Add labels to slices
    pieChartArea.selectAll('text')
        .data(pie(mindStateData))
        .enter()
        .append('text')
        .attr('transform', d => `translate(${arc.centroid(d)})`)
        .text(d => d.data.category)
        .style('font-size', '12px')
        .style('fill', 'white');
}

function getToolTip() {
    return d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        // Font styling
        .style('font-size', '11px')
        .style('font-family', fontFamily)
        .style('color', 'white')
        // Set background color
        .style('background', "#767A83")
        .style('position', 'absolute')
        .style('border', '1px solid #ccc')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none')
        .style('box-shadow', '0 4px 6px rgba(0, 0, 0, 0.1)');
}

function nodeClick(d) {
    // Update selected node
    previousNode = selectedNode;
    selectedNode = d;

    updatedClickedNodeColor();

    // Update node information
    updateSelectedNodeText();
    updateHistogramPieChart();
}

// Set the color of the clicked node to a different color
function updatedClickedNodeColor() {
    // Reset the previous node color
    if (previousNode !== null) {
        graphArea.selectAll("path")
            .filter(d => d.id === previousNode.id)
            .attr("fill", node_color[previousNode.id]);
    }

    // If clicked on the same node, reset the selected node
    if (previousNode === selectedNode) {
        previousNode = null;
        selectedNode = null;
        return;
    }

    graphArea.selectAll("path")
        .filter(d => d.id === selectedNode.id)
        .attr("fill", "#E84C58");
}

function createTimeInterval() {
    // Initialize SVG dimensions
    // const svgWidth = 1000;
    // const svgHeight = 200;
    const svgWidth = d3.select("#time-interval-div").node().clientWidth;
    const svgHeight = d3.select("#time-interval-div").node().clientHeight;
    const padding = 70;

    // Create SVG
    const timeIntervalArea = d3
        .select("#time-interval-div")
        .append("svg")
        .attr("width", svgWidth)
        .attr("height", svgHeight)

    // Define time scale
    const minD = new Date(minDate);
    const maxD = new Date(maxDate);

    const xScale = d3.scaleTime()
        .domain([minD, maxD])
        .range([padding, svgWidth - padding]);
        // .range([padding, svgWidth - padding]);

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
    // Also add the first point to the left of the start date
    const dates = [minD, ...d3.timeDay.range(minD, maxD)];
    timeIntervalArea.selectAll("circle.point")
        .data(dates)
        .enter()
        .append("circle")
        .attr("class", "point")
        .attr("cx", d => xScale(d))
        .attr("cy", svgHeight / 2)
        .attr("r", 2)
        .attr("fill", "black");

    // Add background line through the points
    timeIntervalArea.append("line")
        .attr("x1", xScale(minD))
        .attr("y1", svgHeight / 2)
        .attr("x2", xScale(maxD))
        .attr("y2", svgHeight / 2)
        .attr("stroke", "black")
        .attr("stroke-width", 1);

    // Add boundary labels
    timeIntervalArea.append("text")
        .attr("x", xScale(minD))
        .attr("y", svgHeight / 2 - 20)
        .attr("text-anchor", "middle")
        .text(d3.timeFormat("%b %d, %Y")(minD))
        .attr("font-size", "12px")
        .attr("font-family", fontFamily)
        .attr("fill", "white");

    timeIntervalArea.append("text")
        .attr("x", xScale(maxD))
        .attr("y", svgHeight / 2 - 20)
        .attr("text-anchor", "middle")
        .text(d3.timeFormat("%b %d, %Y")(maxD))
        .attr("font-size", "12px")
        .attr("font-family", fontFamily)
        .attr("fill", "white");
    
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
    const circleRadius = 5;
    const circleColor = "#8ED433";
    timeIntervalArea.append("circle")
        .datum({ date: selectedStartDate, type: "start" })
        .attr("cx", xScale(selectedStartDate))
        .attr("cy", svgHeight / 2)
        .attr("r", circleRadius)
        .attr("fill", circleColor)
        .call(drag);

    // End draggable circle
    timeIntervalArea.append("circle")
        .datum({ date: maxD, type: "end" })
        .attr("cx", xScale(maxD))
        .attr("cy", svgHeight / 2)
        .attr("r", circleRadius)
        .attr("fill", "#F34424")
        .call(drag);

    // Add text for start date
    const dateLabelMargin = 30;
    const fontSizeBelowCircle = "9px";
    timeIntervalArea.append("text")
        .datum({ date: selectedStartDate, type: "start" }) // Match the circle's data
        .attr("id", "start-date-label")
        .attr("x", xScale(selectedStartDate))
        .attr("y", svgHeight / 2 + dateLabelMargin) // Place below the circle
        .attr("text-anchor", "middle")
        .attr("font-size", fontSizeBelowCircle)
        .attr("font-family", fontFamily)
        .attr("fill", "white")
        .text(d3.timeFormat("%d %b")(selectedStartDate)); // Format as "21 Dec"

    // Add text for end date
    timeIntervalArea.append("text")
        .datum({ date: maxD, type: "end" }) // Match the circle's data
        .attr("id", "end-date-label")
        .attr("x", xScale(maxD))
        .attr("y", svgHeight / 2 + dateLabelMargin) // Place below the circle
        .attr("text-anchor", "middle")
        .attr("font-size", fontSizeBelowCircle)
        .attr("font-family", fontFamily)
        .attr("fill", "white")
        .text(d3.timeFormat("%d %b")(maxD)); // Format as "21 Dec"

    // Add number of days text
    timeIntervalArea.append("text")
        .attr("id", "dayCount")
        .attr("x", svgWidth / 2)
        .attr("y", svgHeight / 2 - 40)
        .attr("text-anchor", "middle")
        .text(() => {
            const dayDiff = getSelectedDatesDiff();
            return `${dayDiff} days`;
        })
        .attr("font-size", "12px")
        .attr("font-family", fontFamily)
        .attr("fill", "white");
}

function getSelectedDatesDiff() {
    return Math.ceil((selectedEndDate - selectedStartDate) / (1000 * 60 * 60 * 24));
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

    updateAfterDateChange();
}

function updateAfterDateChange() {
    // Filter nodes
    filterNodes();

    // Update graph
    drawGraph();

    updateHistogramPieChart();
}

function updateHistogramPieChart() {
    drawHistogram();
    drawPieChart();
}