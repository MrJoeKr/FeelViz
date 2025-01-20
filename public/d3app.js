import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm"; //import D3

// d3-force-graph.js
const width = 800;
const height = 600;

// Sample data
let graph = { nodes: [], links: [] };

async function loadGraphData() {
    const [nodes, links] = await Promise.all([
        d3.csv("nodes.csv"),
        d3.csv("links.csv")
    ]);
    graph = {
        nodes: nodes.map(d => ({ id: d.id })),
        links: links.map(d => ({ source: d.source, target: d.target }))
    };
}

await loadGraphData();

console.log(graph);

// const graph = {
//   nodes: [
//     { id: "Alice" },
//     { id: "Bob" },
//     { id: "Charlie" },
//     { id: "Daisy" },
//     { id: "Eve" },
//   ],
//   links: [
//     { source: "Alice", target: "Bob" },
//     { source: "Alice", target: "Charlie" },
//     { source: "Bob", target: "Daisy" },
//     { source: "Charlie", target: "Eve" },
//   ],
// };

// Create SVG container
const svg = d3
  .select("#graph-container")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// Define the simulation
const simulation = d3.forceSimulation(graph.nodes)
  .force("link", d3.forceLink(graph.links).id(d => d.id).distance(100))
  .force("charge", d3.forceManyBody().strength(-300))
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
