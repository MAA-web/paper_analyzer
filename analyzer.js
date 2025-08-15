async function getPaperLinks_data(key, paper_link) {

    let year_ciation_counts = {};
    let result = null;
    console.log("Fetching paper link:", paper_link);

    // Fetch the paper link to extract citation data
    try {
      await fetch(paper_link)
        .then(response => response.text())
          .then(html => {
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, 'text/html');
              const title = doc.querySelector('title').innerText;
              const bars = doc.getElementById("gsc_oci_graph_bars");
              // console.log("Title from link:", title);
              console.log("bars:", bars);
              let spans = bars.querySelectorAll("span")
              let spans_length = spans.length;
              let middle_index = Math.floor(spans_length / 2);
  
              // first half is the years
              let years = Array.from(spans).slice(0, middle_index).map(span => span.innerText);
              console.log("years:", years);
              // second half is the citation counts
              let citationCounts = Array.from(spans).slice(middle_index).map(span => span.innerText);
              console.log("citationCounts:", citationCounts);
  
              // years.forEach((y) => {
              //     console.log("year:", y);
              // });
              // citationCounts.forEach((c) => {
              //     console.log("citation:", c);
              // });
              for (let index = 0; index < middle_index; index++) {
                  year_ciation_counts[years[index]] = citationCounts[index];
              }
              // console.log("Year Citation Counts:", year_ciation_counts);
  
              // bars.querySelectorAll("a").forEach((a) => {
              //     console.log("Link:", a.href);
              // });
          })
      
    } catch (error) {
      console.log(error)
      console.log(paper_link)
    }
    result = {
      [key]: year_ciation_counts
    }
    return result;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}




async function ProcessPapersandPlotGraphs() {
  const pageTitle = document.title;
  console.log("Page Title:", pageTitle);

  // Get all tbody elements on the page
  const tbodies = document.querySelectorAll("tbody");
  let paper_objects = {};

  tbodies.forEach((tbody, index) => {
    console.log(`--- tbody #${index + 1} ---`);
    
    const rows = tbody.querySelectorAll("tr");
    
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      const cellData = [];

      cells.forEach((td, i) => {
        let text = td.innerText.trim();
        let href = "";
        // Check if the first cell contains a link
        if (i === 0) {
          const link = td.querySelector("a");
          if (link) {
            href = link.href;
          }
        }
      //   fetch(href)
      //     .then(response => response.text())
      //     .then(html => {
      //       const parser = new DOMParser();
      //       const doc = parser.parseFromString(html, 'text/html');
      //       const title = doc.querySelector('title').innerText;
      //       console.log(`Title from link ${href}:`, title);
      //       console.log(`Text: ${doc}`);

      //     }).catch(error => console.error('Error fetching link:', error));
        
          // Push text and href to cellData
        cellData.push(text);
        if (href && href !== "javascript:void(0)") {
          cellData.push(href);

          paper_objects[text] = href;
        }
      });

      console.log("Row:", cellData);
      
    });
  });

  console.log("Paper objects:", paper_objects);

  // get the first object i.e along with its key

  // Object.entries(paper_objects).forEach(([paper, link], index) => {
  //   console.log(`Paper ${index + 1}:`, paper, "| Link:", link);
  // });
  paper_count = Object.entries(paper_objects).length


  let paper_graph_points = []
  let index = 0;
  
  for (let [paperName, link] of Object.entries(paper_objects)) {
    console.log(`Fetching: ${paperName}`);
    let response = await getPaperLinks_data(paperName, link);
    paper_graph_points.push(response);
    await sleep(1000); // wait before next fetch
  }

  PlotGraphs(paper_graph_points)

}

// function PlotGraphs(paper_graph_points) {
  
//    // Check if the container already exists (avoid duplicates)
//   let chartsContainer = document.getElementById('charts-container-extension');

//   if (!chartsContainer) {
//     // Inject the container into the page's DOM
//     chartsContainer = document.createElement('div');
//     chartsContainer.id = 'charts-container-extension';
//     chartsContainer.style.position = 'fixed';
//     chartsContainer.style.top = '20px';
//     chartsContainer.style.right = '20px';
//     chartsContainer.style.width = '400px';
//     chartsContainer.style.maxHeight = '80vh';
//     chartsContainer.style.overflowY = 'auto';
//     chartsContainer.style.backgroundColor = 'white';
//     chartsContainer.style.padding = '10px';
//     chartsContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
//     chartsContainer.style.zIndex = '9999';
//     document.body.appendChild(chartsContainer);
//   }

//   // Clear previous charts (optional)
//   chartsContainer.innerHTML = '';

//   let combinedYearsSet = new Set();
//   let combinedDatasets = [];

//   // Generate charts
//   paper_graph_points.forEach((paperObj, idx) => {

//     let paperTitle = Object.keys(paperObj)[0];
//     let citationData = paperObj[paperTitle];
//     let years = Object.keys(citationData);
//     let citations = Object.values(citationData).map(Number);
//     console.log("Graphing: " + paperTitle)


//     // Merge all years for the combined chart
//     years.forEach(y => combinedYearsSet.add(y));

//     // Add dataset for combined chart
//     combinedDatasets.push({
//       label: paperTitle.split('\n')[0].substring(0, 50),
//       data: citations,
//       borderColor: getColor(idx),
//       fill: false
//     });

//     // Container for each chart + controls
//     let chartWrapper = document.createElement('div');
//     chartWrapper.style.marginBottom = '15px';
//     chartWrapper.style.border = '1px solid #ccc';
//     chartWrapper.style.padding = '5px';
//     chartWrapper.style.borderRadius = '5px';

//     // Controls bar
//     let controlsBar = document.createElement('div');
//     controlsBar.style.display = 'flex';
//     controlsBar.style.justifyContent = 'space-between';
//     controlsBar.style.marginBottom = '5px';
//     controlsBar.style.alignItems = 'center';

//     let hideBtn = document.createElement('button');
//     hideBtn.textContent = 'Hide';
//     hideBtn.style.marginRight = '5px';

//     let widthInput = document.createElement('input');
//     widthInput.type = 'number';
//     widthInput.value = 400;
//     widthInput.style.width = '60px';

//     let heightInput = document.createElement('input');
//     heightInput.type = 'number';
//     heightInput.value = 200;
//     heightInput.style.width = '60px';

//     controlsBar.appendChild(hideBtn);
//     controlsBar.appendChild(document.createTextNode('W:'));
//     controlsBar.appendChild(widthInput);
//     controlsBar.appendChild(document.createTextNode(' H:'));
//     controlsBar.appendChild(heightInput);

//     chartWrapper.appendChild(controlsBar);


//     let canvas = document.createElement('canvas');
//     canvas.id = paperTitle

//     chartsContainer.appendChild(canvas);

//     new Chart(canvas, {
//       type: 'line',
//       data: {
//         labels: years,
//         datasets: [{
//           label: `Citations: ${paperTitle.split('\n')[0]}`,
//           data: citations,
//           borderColor: '#3e95cd',
//           fill: false
//         }]
//       },
//       options: {
//         responsive: true,
//         plugins: {
//           title: {
//             display: true,
//             text: paperTitle.split('\n')[0].substring(0, 50) + (paperTitle.length > 50 ? '...' : ''),
//           }
//         }
//       }
//     });


//     // Interactivity
//     hideBtn.addEventListener('click', () => {
//       canvas.style.display = canvas.style.display === 'none' ? 'block' : 'none';
//       hideBtn.textContent = canvas.style.display === 'none' ? 'Show' : 'Hide';
//     });

//     widthInput.addEventListener('input', () => {
//       canvas.width = widthInput.value;
//       chartInstance.resize();
//     });

//     heightInput.addEventListener('input', () => {
//       canvas.height = heightInput.value;
//       chartInstance.resize();
//     });


//   });

  
//   // Create combined chart at the end
//   let combinedCanvas = document.createElement('canvas');
//   chartsContainer.appendChild(combinedCanvas);

//   let sortedYears = Array.from(combinedYearsSet).sort();

//   new Chart(combinedCanvas, {
//     type: 'line',
//     data: {
//       labels: sortedYears,
//       datasets: combinedDatasets
//     },
//     options: {
//       responsive: true,
//       plugins: {
//         title: {
//           display: true,
//           text: 'All Papers Combined Citations'
//         }
//       }
//     }
//   });

// }


function PlotGraphs(paper_graph_points) {

  let chartsContainer = document.getElementById('charts-container-extension');

  if (!chartsContainer) {
    chartsContainer = document.createElement('div');
    chartsContainer.id = 'charts-container-extension';
    // chartsContainer.style.position = 'relative';
    // chartsContainer.style.top = '20px';
    // chartsContainer.style.right = '20px';
    // chartsContainer.style.width = '450px'; // bigger default
    // chartsContainer.style.maxHeight = '85vh';
    // chartsContainer.style.overflowY = 'auto';
    // chartsContainer.style.backgroundColor = 'white';
    // chartsContainer.style.padding = '10px';
    // chartsContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    // chartsContainer.style.zIndex = '9999';
    chartsContainer.style.display = "flex";
    chartsContainer.style.flexDirection = "row"; // horizontal layout
    chartsContainer.style.width = "auto"; // or any px, %, rem value
    chartsContainer.style.height = "auto"; // example height
    chartsContainer.style.flexWrap = "wrap"


    document.body.appendChild(chartsContainer);
  }

  chartsContainer.innerHTML = '';

  let combinedYearsSet = new Set();
  let combinedDatasets = [];

  paper_graph_points.forEach((paperObj, idx) => {
    let paperTitle = Object.keys(paperObj)[0];
    let citationData = paperObj[paperTitle];
    let years = Object.keys(citationData);
    let citations = Object.values(citationData).map(Number);

    years.forEach(y => combinedYearsSet.add(y));
    combinedDatasets.push({
      label: paperTitle.split('\n')[0].substring(0, 10),
      data: citations,
      borderColor: getColor(idx),
      fill: false
    });

    // Container for each chart + controls
    let chartWrapper = document.createElement('div');
    chartWrapper.style.marginBottom = '15px';
    chartWrapper.style.border = '1px solid #ccc';
    chartWrapper.style.padding = '5px';
    chartWrapper.style.borderRadius = '5px';

    // Controls bar
    let controlsBar = document.createElement('div');
    controlsBar.style.display = 'flex';
    controlsBar.style.justifyContent = 'space-between';
    controlsBar.style.marginBottom = '5px';
    controlsBar.style.alignItems = 'center';

    let hideBtn = document.createElement('button');
    hideBtn.textContent = 'Hide';
    hideBtn.style.marginRight = '5px';

    let widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.value = 400;
    widthInput.style.width = '60px';

    let heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.value = 400;
    heightInput.style.width = '60px';

    controlsBar.appendChild(hideBtn);
    controlsBar.appendChild(document.createTextNode('W:'));
    controlsBar.appendChild(widthInput);
    controlsBar.appendChild(document.createTextNode(' H:'));
    controlsBar.appendChild(heightInput);

    // chartWrapper.appendChild(controlsBar);

    // Canvas for chart
    let canvas = document.createElement('canvas');
    canvas.width = widthInput.value;
    canvas.height = heightInput.value;
    chartWrapper.appendChild(canvas);
    chartsContainer.appendChild(chartWrapper);

    // Create chart
    let chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: years,
        datasets: [{
          label: `Citations`,
          data: citations,
          borderColor: '#3e95cd',
          fill: false
        }]
      },
      options: {
        responsive: false,
        scales: {
            y: {
                beginAtZero: true // Ensures the y-axis starts at 0
            }
        },
        plugins: {
          title: {
            display: true,
            text: paperTitle.split('\n')[0].substring(0, 50) + (paperTitle.length > 50 ? '...' : '')
          }
        }
      }
    });

    // Interactivity
    hideBtn.addEventListener('click', () => {
      canvas.style.display = canvas.style.display === 'none' ? 'block' : 'none';
      hideBtn.textContent = canvas.style.display === 'none' ? 'Show' : 'Hide';
    });

    widthInput.addEventListener('input', () => {
      canvas.width = widthInput.value;
      chartInstance.resize();
    });

    heightInput.addEventListener('input', () => {
      canvas.height = heightInput.value;
      chartInstance.resize();
    });
  });

  // Combined chart
  let combineddiv = document.getElementById('combinedContainer');
  if (!combineddiv) {
    combineddiv = document.createElement('div');
    combineddiv.id = 'combinedContainer';
  }
  combineddiv.innerHTML = ''

  let combinedCanvas = document.createElement('canvas');
  document.body.appendChild(combineddiv);
  // combinedCanvas.width = "full"
  combineddiv.appendChild(combinedCanvas);

  let sortedYears = Array.from(combinedYearsSet).sort();

  new Chart(combinedCanvas, {
    type: 'line',
    data: {
      labels: sortedYears,
      datasets: combinedDatasets
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'All Papers Combined Citations'
        }
      }
    }
  });
}


// Helper function to get distinct colors
function getColor(index) {
  const colors = [
    '#3e95cd', '#8e5ea2', '#3cba9f', '#e8c3b9', '#c45850',
    '#ff6384', '#36a2eb', '#cc65fe', '#ffce56', '#4bc0c0'
  ];
  return colors[index % colors.length];
}


// for (let index = 0; index < paper_objects.length; index++) {
  
//   let key_paper_name = Object.keys(paper_objects)[index];
//   let value_link = paper_objects[key_paper_name];
  
//   let response = getPaperLinks_data(key_paper_name, value_link);
//   console.log("Response:", response);
  
//   await sleep(20); // Pause for 2 seconds
  
// }

async function loadChartJS() {
  return new Promise((resolve) => {
    if (window.Chart) {
      resolve(); // Already loaded
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}


let isRunning = 0;

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Received command");

  if (request.action === "analyzePapers") {
    console.log("Received analyze command from popup");
    if (!isRunning) {
      main().then(() => sendResponse({ status: "Charts rendered!" }));
    }
    return true; // Required for async sendResponse
  }
});



async function main() {
  isRunning = 1;
  try {
    await loadChartJS(); // Ensure Chart.js is loaded
    await ProcessPapersandPlotGraphs(); // Wait for data to be fetched
    // await plot_graphs(paper_graph_points);   // Render charts only after data is ready
  } catch (error) {
    console.error("Error in main():", error);
  }
  isRunning = 0;
}