// Example: Extract page title and log it
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
const key_paper_name = Object.keys(paper_objects)[0];
const value_link = paper_objects[key_paper_name];

Object.entries(paper_objects).forEach(([paper, link], index) => {
  console.log(`Paper ${index + 1}:`, paper, "| Link:", link);
});


// let response = getPaperLinks_data(key_paper_name, value_link);
// console.log("Response:", response);

function getPaperLinks_data(key, paper_link) {

    let year_ciation_counts = {};
    
    console.log("Fetching paper link:", paper_link);

    // Fetch the paper link to extract citation data
    fetch(paper_link)
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

    return {"year_citation_counts": year_ciation_counts}
}
