// index.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const OpenAI = require("openai");
const { PORTKEY_GATEWAY_URL, createHeaders } = require("portkey-ai");
const axios = require("axios");
const cheerio = require("cheerio"); // New import for web scraping
const fs = require("fs").promises;
const path = require("path");
const HTMLtoDOCX = require("html-to-docx");
const Promise = require("bluebird");
const vision = require("@google-cloud/vision");
const { spawn } = require("child_process");
const cors = require("cors");
const crypto = require("crypto");
const Portkey = require("portkey-ai").default;
const portkey = new Portkey({ apiKey: process.env.PORTKEY_API_KEY });

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, "dist")));

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, "temp");
fs.mkdir(tempDir, { recursive: true })
  .then(() => console.log("Temporary directory ensured"))
  .catch(console.error);

// Set up Google Cloud credentials path
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
  console.log(
    "Google Cloud credentials path:",
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
} else {
  console.warn(
    "GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. OCR functionality may not work.",
  );
}

// Configure Google Cloud Vision
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

app.use(express.json());

// Helper function to summarize market opportunity
async function summarizeMarketOpportunity(text, traceId, spanId) {
  try {
    const openai = new OpenAI({
      baseURL: PORTKEY_GATEWAY_URL,
      defaultHeaders: createHeaders({
        provider: "openai",
        apiKey: process.env.PORTKEY_API_KEY,
        traceId: traceId,
      }),
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a market research expert. Analyze the given company description and provide a concise summary of the market opportunity.",
        },
        {
          role: "user",
          content: `Based on this company description, provide a focused summary of the market opportunity. Include:
1. The specific problem or need the company is addressing. Do not mention things like company is addressing... but directly just say the problem or opportuntiy in a given space, so isolate to focus solely on the space.
2. The target market or customer segment (be as specific as possible, e.g., 'small to medium e-commerce businesses' rather than just 'businesses').
Focus on the most crucial information to describe the specific space they are in, make sure it's no longer than 10 lines.
Company description: ${text}`,
        },
      ],
    }, {
      headers: {
        'x-portkey-trace-id': traceId,
        'x-portkey-span-id': spanId,
        'x-portkey-span-name': 'Summarize Market Opportunity'
      }
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error in summarizeMarketOpportunity:", error);
    throw error;
  }
}

// Function to run the Python script for market analysis
async function runMarketAnalysis(marketOpportunity, traceId) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python", ["main.py", marketOpportunity, traceId]);
    let result = "";

    pythonProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("Python script output:", output); // Log all output
      result += output;
    });

    pythonProcess.stderr.on("data", (data) => {
      console.error("Python script error:", data.toString()); // Log any errors
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}`);
        reject(`Python script exited with code ${code}`);
      } else {
        try {
          // Find the last valid JSON in the output
          const jsonStart = result.lastIndexOf("{");
          const jsonEnd = result.lastIndexOf("}");
          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            const jsonResult = JSON.parse(
              result.substring(jsonStart, jsonEnd + 1),
            );
            resolve(jsonResult);
          } else {
            throw new Error("No valid JSON found in the output");
          }
        } catch (error) {
          console.error("Error parsing JSON:", error);
          resolve({ error: "Failed to parse Python script output" });
        }
      }
    });
  });
}

// Helper function to fetch LinkedIn profile data
async function getLinkedInProfile(url) {
  if (!url) return null;

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://www.linkedin.com/in/${url.replace(/^(https?:\/\/)?(www\.)?linkedin\.com\/(in\/)?/, "")}`;
  }

  console.log("Fetching LinkedIn profile for URL:", url);

  try {
    const response = await axios.get(
      "https://nubela.co/proxycurl/api/v2/linkedin",
      {
        params: {
          url: url,
          use_cache: "if-present",
        },
        headers: {
          Authorization: "Bearer " + process.env.PROXYCURL_API_KEY,
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error(
      "Error fetching LinkedIn profile:",
      error.response ? error.response.data : error.message,
    );
    if (error.response && error.response.status === 404) {
      return {
        error:
          "LinkedIn profile not found. Please check the URL and try again.",
      };
    } else if (error.response && error.response.status === 400) {
      return {
        error:
          "Invalid LinkedIn URL. Please provide a complete LinkedIn profile URL.",
      };
    }
    return {
      error: "Unable to fetch LinkedIn profile data. Please try again later.",
    };
  }
}

// Helper function to OCR
async function processOCRDocuments(files) {
  let extractedText = "";

  for (const file of files) {
    if (file.mimetype === "application/pdf") {
      try {
        console.log(`Processing OCR for file: ${file.originalname}`);

        // Read the file content
        const content = await fs.readFile(file.path);

        // Create a request to process the PDF
        const request = {
          requests: [
            {
              inputConfig: {
                mimeType: "application/pdf",
                content: content.toString("base64"),
              },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        };

        // Make the request to Google Cloud Vision API
        const [result] = await visionClient.batchAnnotateFiles(request);

        // Extract text from the response
        const pages = result.responses[0].responses;
        for (const page of pages) {
          if (page.fullTextAnnotation) {
            extractedText += page.fullTextAnnotation.text + "\n\n";
          }
        }

        console.log(`Text extracted from file: ${file.originalname}`);
      } catch (error) {
        console.error("Error processing PDF with Google Cloud Vision:", error);
      }
    } else {
      console.warn(`Unsupported file type for OCR: ${file.mimetype}`);
    }
    // Clean up uploaded file
    await fs.unlink(file.path);
  }

  return extractedText;
}

// New function to extract content from a URL
async function extractContentFromUrl(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Remove script and style elements
    $('script, style').remove();

    // Extract text content
    let content = $('body').text();

    // Clean up whitespace
    content = content.replace(/\s+/g, ' ').trim();

    return content;
  } catch (error) {
    console.error("Error extracting content from URL:", error);
    return "";
  }
}

// File upload and processing endpoint
app.post(
  "/upload",
  upload.fields([{ name: "documents" }, { name: "ocrDocuments" }]),
  async (req, res) => {
    const traceId = crypto.randomUUID();
    console.log(`Starting memo generation process with trace ID: ${traceId}`);

    try {
      const files = req.files["documents"] || [];
      const ocrFiles = req.files["ocrDocuments"] || [];
      const linkedInUrls = req.body.linkedInUrls || [];
      const currentRound = req.body.currentRound || "";
      const proposedValuation = req.body.proposedValuation || "";
      const valuationDate = req.body.valuationDate || "";
      const url = req.body.url || ""; // New: Get the URL from the request

      console.log(
        "Received files:",
        files.map((f) => f.originalname),
      );
      console.log(
        "Received OCR files:",
        ocrFiles.map((f) => f.originalname),
      );
      console.log("Received LinkedIn URLs:", linkedInUrls);
      console.log("Raising:", currentRound);
      console.log("Post-Money:", proposedValuation);
      console.log("Analysis Date:", valuationDate);
      console.log("Received URL:", url); // Log the received URL

      let extractedText = "";

      // Process regular documents
      for (const file of files) {
        const fileBuffer = await fs.readFile(file.path);
        if (file.mimetype === "application/pdf") {
          const pdfData = await pdf(fileBuffer);
          extractedText += pdfData.text + "\n\n";
        } else if (
          file.mimetype ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          extractedText += result.value + "\n\n";
        } else {
          console.warn(`Unsupported file type: ${file.mimetype}`);
        }
        // Clean up uploaded file
        await fs.unlink(file.path);
      }

      // Process OCR documents only if there are any
      if (ocrFiles.length > 0) {
        const ocrText = await processOCRDocuments(ocrFiles);
        extractedText += ocrText;
      }

      // New: Extract content from URL if provided
      if (url) {
        console.log("Extracting content from URL:", url);
        const urlContent = await extractContentFromUrl(url);
        extractedText += "\n\nContent from provided URL:\n" + urlContent;
      }

      console.log("Extracted text length:", extractedText.length);

      if (extractedText.length === 0) {
        return res.status(400).json({
          error: "No text could be extracted from the uploaded files or URL. Please check the inputs and try again.",
        });
      }

      // Fetch and process LinkedIn data
      const founderData = await Promise.all(
        linkedInUrls.map(async (url) => {
          if (url) {
            console.log("Processing LinkedIn URL:", url);
            const profileData = await getLinkedInProfile(url);
            if (profileData.error) {
              return `Error fetching founder background: ${profileData.error}`;
            } else {
              return `
            Name: ${profileData.full_name}
            Current Position: ${profileData.occupation}
            Summary: ${profileData.summary}
            Experience: ${profileData.experiences ? profileData.experiences.map((exp) => `${exp.title} at ${exp.company}`).join(", ") : "Not available"}
            Education: ${profileData.education ? profileData.education.map((edu) => `${edu.degree_name} from ${edu.school}`).join(", ") : "Not available"}
            Skills: ${profileData.skills ? profileData.skills.join(", ") : "Not available"}
            LinkedIn URL: ${url}
          `;
            }
          }
          return null;
        }),
      );

      // Combine extracted text from documents and LinkedIn data
      const combinedText = `
      Current Deal Terms:
      Current Funding Round: ${currentRound || "Not provided"}
      Proposed Valuation: ${proposedValuation || "Not provided"}
      Analysis Date: ${valuationDate || "Not provided"}
      Extracted Text from Documents:
      ${extractedText}
      Founder Information from LinkedIn:
      ${founderData.filter((data) => data !== null).join("\n\n")}
    `;

      // Summarize market opportunity
      const marketOpportunitySpanId = crypto.randomUUID();
      const marketOpportunity = await summarizeMarketOpportunity(extractedText, traceId, marketOpportunitySpanId);
      console.log("Market opportunity:", marketOpportunity);

      // Run the market analysis
      const marketAnalysisResult = await runMarketAnalysis(marketOpportunity, traceId);
      console.log("Market analysis result:", marketAnalysisResult);

      // Generate the full memorandum
      const openai = new OpenAI({
        baseURL: PORTKEY_GATEWAY_URL,
        defaultHeaders: createHeaders({
          provider: "openai",
          apiKey: process.env.PORTKEY_API_KEY,
          traceId: traceId,
        }),
        apiKey: process.env.OPENAI_API_KEY,
      });

      const fullMemoSpanId = crypto.randomUUID();
      const completion = await openai.chat.completions.create({
        model: "o1-preview",
        messages: [
          {
            role: "user",
            content: `
      You are a top-tier senior venture capitalist with experience in evaluating early-stage startups. Your role is to generate comprehensive investment memorandums based on provided information. Format the output using HTML tags for better readability. Limit yourself to the data given in context and do not make up things or people will get fired. Each section should be detailed and comprehensive, with a particular focus on providing extensive information in the product description section. Generating all required sections of the memo is a must.

      Generate a detailed and comprehensive investment memorandum based on the following information:

      Market Opportunity: ${marketOpportunity}

      Current Deal Terms:
      Current Funding Round: ${currentRound || "Not provided"}
      Proposed Valuation: ${proposedValuation || "Not provided"}
      Analysis Date: ${valuationDate || "Not provided"}

      Market Analysis Result:
      Market Sizing Information: ${marketAnalysisResult.market_analysis || "Not available"}
      Competitor Analysis: ${marketAnalysisResult.competitor_analysis || "Not available"}

      Additional Context: ${combinedText}

      Structure the memo with the following sections, using HTML tags for formatting:

      1. <h2>Executive Summary</h2>
         - Include deal terms and analysis date
         - Provide a concise summary of the company's offering
         - Explain why this investment could be attractive for Flybridge. Be specific, highlighting the "why now" and "why this team in this space." Keep this part concise with the main specific points.

      2. <h2>Market Opportunity and Sizing</h2>
         - Explain the current unattended area or problems companies face. Mention any tailwinds making this space more attractive at this moment. Keep the "why now" reasons to 2-3 points.
         - Provide a detailed market sizing calculation using as much data as given in the context. Include:
           - Total Addressable Market (TAM) and the CAGR or expected growth with reason, making sure you detail to what market you are reffering to 
           - For each number included (like market size in billions or growth rate), provide details. Also provide hyperlink to the URL of sources if available 

      3. <h2>Competitive Landscape</h2>
         - Analyze competitors, providing descriptions of what they do, any traction, super key to provide total funding when data is available - If not available do not make it up stick with context. 
         - Provide a detailed comparison of strengths and weaknesses of each competitor.

      4. <h2>Product/Service Description</h2>
         -- Offer a comprehensive description of the product or services. This section should be very detailed.
         - Mention what is unique about their approach with good detail.
         - Explain why it's a good fit for the market.
         - Provide an in-depth analysis of the AI stack, including:
           - AI tech strategy and differentiation; be detailed if context is provided.
           - Include a detailed section on the product roadmap, outlining future products and long-term vision.
           - Include a section that put's what are going to be the company competitive advantage this section is forward looking, and a a mix of information from input but also thinking through company input what can become in future those competitive advantages.

      5. <h2>Business Model</h2>
         - Describe the company's revenue streams and pricing strategy.
         - Analyze the scalability and sustainability of the business model.

      6. <h2>Team</h2>
         - Use LinkedIn data if available, usually under "Founder Information from LinkedIn."
         - Must Include hyperlinks to the founders' LinkedIn profiles if provided.
         - Provide detailed backgrounds and relevant experience of key team members.
         - Provide background on how they came together and entered this space if context is given.

      7. <h2>Go-to-Market Strategy</h2>
         - Offer a comprehensive description of the company's go-to-market strategy.
         - Define the Ideal Customer Profile (ICP).
         - Describe current traction or pilots, if applicable.
         - Outline the strategy for user acquisition and growth.
         - Mention milestones the company has for the next round if data is available.

      8. <h2>Main Risks</h2>
         - List and analyze the main 4-6 risks that could lead to the startup's failure, being very specific to the business.

      9. <h2>What Can Go Massively Right</h2>
         - Provide visionary thinking about the most optimistic scenario for the company's future while keeping realistic expectations. Focus on long-term impact and success, highlighting critical assumptions or market conditions necessary for high success.

      10. <h2>Tech Evaluation and Scores</h2>
          - On a scale of 1 to 10, rate their idea, pitch, and approach, considering factors such as technological differentiation, competition, go-to-market strategy, and traction. Provide reasons for each rating.
          - Critically analyze and evaluate the technical aspects of AI startup pitches. Identify and critique areas where the pitch may fall short, highlight potential risks, and address challenges in implementation and achievement.
          - Focus on technical feasibility, accuracy, integration, scalability, and other critical areas relevant to AI technology.
          - Provide detailed critiques of specific technical areas that may be more challenging than initially expected.
          - Highlight any technical assumptions that may not hold up in real-world scenarios.
          - Discuss potential pitfalls in proposed AI models, algorithms, data handling, or infrastructure.
          - Avoid generic comments; focus on providing deep technical insights with clear explanations and justifications.

        11. <h2>Follow-up- questions</h2>
          - Generate 4-7 specific follow-up questions to ask the founding team. These questions should address areas where we lack sufficient information or highlight critical risks that could impact the company's success or failure. The questions should be tailored to the specific business, avoiding generic queries, and should help elevate the discussion by diving deeper into the key topics we already have insights on. They should be thoughtful, relevant, and designed to lead to meaningful conversations with the founders.

      Use the provided information to create a coherent, comprehensive, and detailed memorandum. Expand on the information provided to create full, informative sections. Ensure the company's solution is positioned within the context of the market opportunity and competitive landscape.

      Use appropriate HTML tags for formatting:
      - <p> for paragraphs
      - <ul> and <li> for unordered lists
      - <ol> and <li> for ordered lists
      - <strong> for emphasis
      - <h3> for subsections within main sections

      Avoid adding unnecessary spaces between sections. Focus on providing in-depth analysis and detailed information rather than worrying about the length of the memorandum. If for any given section you don't have context you can say there is not enough context on that specific section.
            `,
          },
        ],
      }, {
        headers: {
          'x-portkey-trace-id': traceId,
          'x-portkey-span-id': fullMemoSpanId,
          'x-portkey-span-name': 'Generate Full Memorandum'
        }
      });

      const memorandum = completion.choices[0].message.content;
      console.log("Generated memorandum length:", memorandum.length);

      res.json({ memorandum: memorandum, traceId: traceId });
    } catch (error) {
      console.error("Error in /upload route:", error);
      res.status(500).json({
        error: "An error occurred while processing your request.",
        details: error.message,
      });
    }
  },
);

// New download endpoint
app.post("/download", express.json(), async (req, res) => {
  console.log("Download route hit");
  try {
    const { content } = req.body;
    const fileBuffer = await HTMLtoDOCX(content, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=investment_memorandum.docx",
    );
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error generating Word document:", error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the Word document." });
  }
});

// Feedback
app.post("/feedback", async (req, res) => {
  const { traceId, value } = req.body;

  try {
    await portkey.feedback.create({
      traceID: traceId,
      value: value, // Integer between -10 and 10
      weight: 1, // Optional
      metadata: {
        // You can add additional metadata here if needed
      },
    });

    res.status(200).json({ message: "Feedback submitted successfully" });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res
      .status(500)
      .json({ error: "An error occurred while submitting feedback." });
  }
});

// Add the health check route before your other routes 
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Catch-all route to serve the React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// Use the port provided by Replit, or fallback to 3000
const PORT = process.env.PORT || 3000;
console.log(`Using port: ${PORT}`);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
         