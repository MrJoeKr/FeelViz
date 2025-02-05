import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm"; //import D3

const fontFamily = "Trebuchet MS";

// Maximum date range
// let minDate = "2024-10-10";
let minDate = "2024-10-07";
// Last date is not included in the range
let maxDate = "2024-12-24";

// Selected date range, used for filtering nodes in the graph
// let selectedStartDate = new Date(minDate);
// // It is the maxDate - 1 day
// let selectedEndDate = new Date(new Date(maxDate).setDate(new Date(maxDate).getDate() - 1));
let selectedStartDate = new Date("2024-10-18");
let selectedEndDate = new Date("2024-10-31");

// Selected node, used to display information
let previousNode = null;
let selectedNode = null;
// Links of the selected node
let selectedNodeLinks = [];

// Selected mindState, used to filter nodes in the graph by mindState
let previousMindState = null;
let selectedMindState = null;

// Dictionary of all edges (links), i.e. pairs of nodes in format "node1|node2"
// Used to avoid duplicate edges
// nodeA|nodeB -> count
let link_count = {};

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

const histogramMargin = { top: 20, right: 20, bottom: 40, left: 40 };

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

// Word to mindState mapping
const MINDSTATE_NUM = {
    "Very Unpleasant": "-3",
    "Unpleasant": "-2",
    "Slightly Unpleasant": "-1",
    "Neutral": "0",
    "Slightly Pleasant": "1",
    "Pleasant": "2",
    "Very Pleasant": "3"
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
    createSelectedMindStateText();
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
    return d3.csv("data/nodes.csv").then(data => {
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
        // Filter by date
        if (!(selectedStartDate <= dDate && dDate <= selectedEndDate)) {
            continue;
        }

        // Filter by mindState
        if (selectedMindState !== null) {
            const mindState = day_stats[date].mindState;

            if (mindState !== selectedMindState)
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

    // Clear node count
    node_count = {};
    // Clear link count
    link_count = {};

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
                // Check both directions to avoid duplicates
                const edge = `${node}|${otherNode}`;
                const reverseEdge = `${otherNode}|${node}`;
                // Add edge if not already in graph.links
                if (link_count[edge] === undefined && link_count[reverseEdge] === undefined) {
                    link_count[edge] = 0;
                    graph.links.push({ source: node, target: otherNode });
                }
                link_count[edge]++;
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

        // Set the color of the node
        const color = MINDSTATE_NUMS[maxMindState].color;
        node_color[node] = color;
    }
}

/* CSV file */
function loadDayStats() {
    return d3.csv("data/day_stats.csv").then(data => {
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

// Add selected mindState text
function createSelectedMindStateText() {
    d3.select("#selected-mindstate-div").append("svg")
    .attr("width", d3.select("#selected-mindstate-div").node().clientWidth)
    .attr("height", d3.select("#selected-mindstate-div").node().clientHeight)

    updateSelectedMindStateText();
}

function updateSelectedNodeText() {
    let text;
    if (selectedNode === null) {
        text = 
            "No node selected. Showing all statistics from the selected date range.";
    }
    else {
        text = 'Selected Node: "' + selectedNode.id + '". '
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

function updateSelectedMindStateText() {
    let text;
    if (selectedMindState === null) {
        text = "Showing all feelings. Click on a pie chart's slice to filter by a feeling.";
    }
    else {
        // Color the text by mindState
        text = 'Selected feeling: <span style="color:' 
            + MINDSTATE_NUMS[selectedMindState].color + ';">' 
            + MINDSTATE_NUMS[selectedMindState].name + '</span>.';
    }

    d3.select("#selected-mindstate-div svg").selectAll("*").remove();
    d3.select("#selected-mindstate-div svg").append("foreignObject")
    .attr("x", 10)
    .attr("y", 10)
    .attr("width", d3.select("#selected-mindstate-div").node().clientWidth)
    .attr("height", d3.select("#selected-mindstate-div").node().clientHeight)
    .append("xhtml:div")
    .style("font-family", fontFamily)
    .style("font-size", "15px")
    .style("color", "white")
    .html(text);
}


function getLinkCount(nodeA, nodeB) {

    const link1 = `${nodeA}|${nodeB}`;
    const link2 = `${nodeB}|${nodeA}`;

    let count = 0;
    if (link_count[link1] !== undefined) {
        count = link_count[link1];
    } else if (link_count[link2] !== undefined) {
        count = link_count[link2];
    } else {
        console.log("Error: link count not found for " + nodeA + " and " + nodeB);
    }

    return count;
}

function linkDistance(link) {
    const count = getLinkCount(link.source.id, link.target.id);

    // return 40;
    // The higher the count, the shorter the distance
    return 20 / count;
}

// function linkCharge(link)

// Return node -> percentage of total nodes
function getNodePercentage(node) {
    let node_percentage = {};
    for (let key in node_count) {
        node_percentage[key] = node_count[key] / graph.nodes.length;
    }
    return node_percentage;
}

function drawGraph() {
    // Clear graph area
    graphArea.selectAll("*").remove();

    // For zooming in and out
    let transform = d3.zoomIdentity;

    const graphWidth = d3.select("#graph-div").node().clientWidth;
    const graphHeight = d3.select("#graph-div").node().clientHeight;

    const simulation = d3.forceSimulation(graph.nodes)
        .force("link", d3.forceLink(graph.links)
            .id(d => d.id)
            .distance(d => linkDistance(d)))
        .force("charge", d3.forceManyBody().strength(-50))
        .force("center", d3.forceCenter(graphWidth / 2, graphHeight / 2));
    
    // Add zooming
    const zoomRect = graphArea.append("rect")
        .attr("width", graphWidth)
        .attr("height", graphHeight)
        .attr("fill", "none")
        .attr("pointer-events", "all")

    const zoom = d3.zoom()
        .scaleExtent([0.5, 64])
        .on("zoom", function(event) {
            transform = event.transform;
            graphArea.attr("transform", event.transform);
        })
        .filter(function(event) {
            // Ignore when CTRL key is pressed
            return !event.ctrlKey;
        });
    
    zoomRect.call(zoom)
        .call(zoom.translateTo, graphWidth / 2, graphHeight / 2);

    // Add links
    const link = graphArea
        .append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(graph.links)
        .enter()
        .append("line")
        // .attr("stroke", "#D4D7DB")
        .attr("stroke", d => setLinkColor(d))
        .attr("stroke-width", 0.5);
    
    // For sizing nodes
    const node_percentage = getNodePercentage(graph.nodes);

    const node = graphArea
        .selectAll(".node")
        .data(graph.nodes)
        .enter()
        .append("path")
        .attr("d", d3.symbol()
            .type(d => node_shape[d.id])
            // .size(d => node_count[d.id] * 20) // Set size based on node count
            .size(d => 1500 * node_percentage[d.id]) // Set size based on node count
        )
        // Update color based on selected node
        .attr("fill", d => d.id === selectedNode?.id ? "#E84C58" : node_color[d.id])
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
    const labelTextSize = 6;
    const label = graphArea
        .append("g")
        .attr("class", "labels")
        // Make the text unselectable
        .attr("class", "noselect")
        .selectAll("text")
        .data(graph.nodes)
        .enter()
        .append("text")
        .attr("dy", -15)
        .attr("text-anchor", "middle")
        .text(d => d.id)
        .attr("fill", "black")
        .attr("font-size", d => labelTextSize + "px");

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

// Set the color of the link based on the selected node
function setLinkColor(link) {
    if (selectedNode === null) {
        return "#D4D7DB";
    }
    for (let i = 0; i < selectedNodeLinks.length; i++) {
        if (link.source.id === selectedNodeLinks[i].source &&
            link.target.id === selectedNodeLinks[i].target) {
            return "#000000";
        }
    }
    return "#D4D7DB";
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
    const histogramWidth = 
        450 - histogramMargin.left - histogramMargin.right;
    const histogramHeight = 
        300 - histogramMargin.top - histogramMargin.bottom;

    // Clear histogram area 
    histogramArea.selectAll("*").remove();

    // Add title
    histogramArea.append("text")
        .attr("x", histogramWidth / 2)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-family", fontFamily)
        .attr("font-size", "20px")
        .text("Time Slept Histogram");

    // Prepare data and set scales
    const timeSleptValues = selectTimeSleptValues();
    const x = d3.scaleLinear()
        .domain([d3.min(timeSleptValues) - 0.3, d3.max(timeSleptValues) + 0.3])
        .range([0, histogramWidth]);

    const histogram = d3.histogram()
        .value(d => d) // TimeSlept values already processed
        .domain(x.domain())
        .thresholds(x.ticks(10));

    const bins = histogram(timeSleptValues);

    const y = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length) + 1]) // Max frequency + 1
        // .domain([0, getSelectedDatesDiff()]) // Max frequency is the number of days
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
        // Integers only
        .call(d3.axisLeft(y)
            .ticks(y.domain()[1])
                .tickFormat(d3.format("d")));
    
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

            // Skip date that is not in date_nodes
            if (date_nodes[dateString] === undefined)
                continue;

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

    const margin = { top: 30, right: 20, bottom: 20, left: 20 };
    const titleHeight = 20;

    // Chart dimensions
    const width = 300 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom - titleHeight;

    const radius = Math.min(width, height) / 2;

    // Create the pie generator
    const pie = d3.pie()
        .value(d => d.value);

    // Create the arc generator
    const arc = d3.arc()
        .innerRadius(63) // For a hole in the middle
        .outerRadius(radius);

    // Create a tooltip
    const tooltip = getToolTip();

    // Animation flag
    let animationDone = false;

    // Bind data to pie slices
    const slices = pieChartArea.selectAll('path')
        .data(pie(mindStateData.sort(
            // Transform to nums and sort
            (a, b) => parseInt(MINDSTATE_NUM[a.category]) - parseInt(MINDSTATE_NUM[b.category]))))
        .enter()
        .append('path')
        .attr('d', arc)
        .attr('fill', d => d.data.color) // Use `color` from data
        .attr('stroke', 'white')
        .style('stroke-width', '2px')
        .on('mouseover', function (event, d) {
            // Wait for animation to finish
            if (!animationDone) return;

            // Tooltip logic on hover
            tooltip.transition().duration(200).style('opacity', 1);
            tooltip.html(`${d.data.category}: ` +
                    `${d.data.value}/${getSelectedDatesDiff()} days`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 20) + 'px');
            d3.select(this).transition().duration(200).attr('transform', 'scale(1.08)');
        })
        .on('mouseout', function () {
            // Wait for animation to finish
            if (!animationDone) return;

            // Tooltip hide logic
            tooltip.transition().duration(200).style('opacity', 0);
            d3.select(this).transition().duration(200).attr('transform', 'scale(1)');
        })
        // Filter nodes by mindState on click
        .on('click', function (event, d) {
            // Remove tooltip HTML
            tooltip.remove();
            pieChartSliceClick(d);
        })
        // Animation of slices on load
        .each(function (d) {
            this._current = { startAngle: 0, endAngle: 0 };
        })
        .transition()
        .duration(500)
        .attrTween('d', function (d) {
            const interpolate = d3.interpolate(this._current, d);
            this._current = interpolate(1);
            return function (t) {
                return arc(interpolate(t));
            };
        })
        .on('end', () => {
            animationDone = true;
        });
    
    const shortenText = {
        "Very Unpleasant": "VU",
        "Unpleasant": "U",
        "Slightly Unpleasant": "SU",
        "Neutral": "N",
        "Slightly Pleasant": "SP",
        "Pleasant": "P",
        "Very Pleasant": "VP"
    };

    // Add labels to slices
    pieChartArea.selectAll('text')
        .data(pie(mindStateData))
        .enter()
        .append('text')
        .attr('transform', d => `translate(${arc.centroid(d)})`)
        .text(d => shortenText[d.data.category])
        .style('font-size', '12px')
        .style('fill', 'white');

    // Title
    pieChartArea.append("text")
        .attr("x", 0)
        .attr("y", -height / 2 - titleHeight)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-family", fontFamily)
        .attr("font-size", "20px")
        .text("Feelings Pie Chart");

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

function pieChartSliceClick(slice) {
    // Update selected mindState
    previousMindState = selectedMindState;
    selectedMindState = MINDSTATE_NUM[slice.data.category];

    // If clicked on the same slice, reset the selected mindState
    if (selectedMindState !== null && previousMindState === selectedMindState)
        selectedMindState = null;

    updateSelectedMindStateText();
    updateAllCharts();
}

function nodeClick(d) {
    // Update selected node
    previousNode = selectedNode;
    selectedNode = d;

    // If clicked on the same node, reset the selected node
    if (selectedNode !== null && previousNode === selectedNode)
        selectedNode = null;

    // Update links
    updateSelectedNodeLinks();

    updatedClickedNodeColor();

    // Update node information
    updateSelectedNodeText();
    updateHistogramPieChart();
}

function updateSelectedNodeLinks() {
    selectedNodeLinks = [];

    // Return if no node is selected
    if (selectedNode === null)
        return;

    // Find all links that contain the selected node
    for (let node in node_dates) {
        if (node === selectedNode.id) continue;
        const link1 = `${selectedNode.id}|${node}`;
        if (link_count[link1] !== undefined && link_count[link1] > 0) {
            // Push the link
            selectedNodeLinks.push({ source: selectedNode.id, target: node });
        }
        
        const link2 = `${node}|${selectedNode.id}`;
        if (link_count[link2] !== undefined && link_count[link2] > 0) {
            // Push the link
            selectedNodeLinks.push({ source: node, target: selectedNode.id });
        }
    }
}

// Set the color of the clicked node to a different color
function updatedClickedNodeColor() {
    // Reset the previous node color
    if (previousNode !== null) {
        graphArea.selectAll("path")
            .filter(d => d.id === previousNode.id)
            .attr("fill", node_color[previousNode.id]);
        
        // Reset the links
        graphArea.selectAll("line")
            .attr("stroke", "#D4D7DB");
    }

    // Return if no node is selected
    if (selectedNode === null)
        return;

    // Change the color of the selected node
    graphArea.selectAll("path")
        .filter(d => d.id === selectedNode.id)
        .attr("fill", "#E84C58");

    // Change color of the links for the selected node
    graphArea.selectAll("line")
        .attr("stroke", d => setLinkColor(d));
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
        .datum({ date: selectedEndDate, type: "end" })
        .attr("cx", xScale(selectedEndDate))
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
        .datum({ date: selectedEndDate, type: "end" }) // Match the circle's data
        .attr("id", "end-date-label")
        .attr("x", xScale(selectedEndDate))
        .attr("y", svgHeight / 2 + dateLabelMargin) // Place below the circle
        .attr("text-anchor", "middle")
        .attr("font-size", fontSizeBelowCircle)
        .attr("font-family", fontFamily)
        .attr("fill", "white")
        .text(d3.timeFormat("%d %b")(selectedEndDate)); // Format as "21 Dec"

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

    updateAllCharts();
}

function updateAllCharts() {
    // Filter nodes
    filterNodes();

    // Update links
    updateSelectedNodeLinks();

    // Update graph
    drawGraph();

    updateHistogramPieChart();
}

function updateHistogramPieChart() {
    drawHistogram();
    drawPieChart();
}
