// src/components/App.jsx
import React, { useState } from "react";
import axios from "axios";

import FileUpload from "./components/FileUpload";
import DealTerms from "./components/DealTerms";
import FounderInfo from "./components/FounderInfo";
import MemorandumDisplay from "./components/MemorandumDisplay";
import LoadingIndicator from "./components/LoadingIndicator";
import ErrorMessage from "./components/ErrorMessage";
import UrlInput from "./components/UrlInput"; // New import

function App() {
  // State variables
  const [founderCount, setFounderCount] = useState(1);
  const maxFounders = 3;
  const [memorandumContent, setMemorandumContent] = useState("");
  const [documents, setDocuments] = useState(null);
  const [ocrDocuments, setOcrDocuments] = useState(null);
  const [currentRound, setCurrentRound] = useState("");
  const [proposedValuation, setProposedValuation] = useState("");
  const [valuationDate, setValuationDate] = useState("");
  const [linkedInUrls, setLinkedInUrls] = useState([""]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [showDownload, setShowDownload] = useState(false);
  const [traceId, setTraceId] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [url, setUrl] = useState(""); // New state for URL input

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!valuationDate) {
      setError("Please fill in the Analysis Date.");
      return;
    }

    const formData = new FormData();

    if (documents) {
      for (let i = 0; i < documents.length; i++) {
        formData.append("documents", documents[i]);
      }
    }

    if (ocrDocuments) {
      for (let i = 0; i < ocrDocuments.length; i++) {
        formData.append("ocrDocuments", ocrDocuments[i]);
      }
    }

    formData.append("currentRound", currentRound.replace(/,/g, ""));
    formData.append("proposedValuation", proposedValuation.replace(/,/g, ""));
    formData.append("valuationDate", valuationDate);
    linkedInUrls.forEach((url) => {
      formData.append("linkedInUrls[]", url);
    });
    formData.append("url", url); // Add URL to form data

    setLoading(true);
    setResult("");
    setShowDownload(false);
    setError("");
    setTraceId("");
    setShowFeedback(false);
    setFeedbackSubmitted(false);

    try {
      const response = await axios.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      setMemorandumContent(response.data.memorandum);
      setResult(response.data.memorandum);
      setShowDownload(true);
      setTraceId(response.data.traceId);
      setShowFeedback(true);
    } catch (error) {
      console.error("Error:", error);
      setError(`An error occurred: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle feedback submission
  const sendFeedback = async (value) => {
    try {
      await axios.post("/feedback", {
        traceId: traceId,
        value: value,
      });
      setShowFeedback(false);
      setFeedbackSubmitted(true);
    } catch (error) {
      console.error("Feedback error:", error);
      alert("An error occurred while submitting feedback.");
    }
  };

  // Handle memorandum download
  const handleDownload = async () => {
    try {
      const response = await fetch("/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: memorandumContent }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorText}`,
        );
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = downloadUrl;
      a.download = "investment_memorandum.docx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Download error:", error);
      alert(
        "An error occurred while downloading the memorandum: " + error.message,
      );
    }
  };

  // Clean up HTML content
  const cleanHtml = (html) => {
    let cleanedHtml = html
      .replace(/^\s*```html\s*/, "")
      .replace(/\s*```\s*$/, "");
    cleanedHtml = cleanedHtml
      .replace(/(\r\n|\n|\r)/gm, "")
      .replace(/\s+/g, " ");
    cleanedHtml = cleanedHtml.replace(/<\/li>\s*<li>/g, "</li><li>");
    cleanedHtml = cleanedHtml.replace(/<\/h2>\s*<p>/g, "</h2><p>");
    return cleanedHtml;
  };

  // Handle document changes
  const handleDocumentsChange = (files) => {
    console.log("Setting documents:", files);
    setDocuments(files);
  };

  // Handle OCR document changes
  const handleOcrDocumentsChange = (files) => {
    console.log("Setting OCR documents:", files);
    setOcrDocuments(files);
  };

  return (
    <div className="app-container">
      <h1 className="app-title">Flybridge Investment Memorandum Generator</h1>
      <div className="content-wrapper">
        <div className="description">
          <p>
            <strong>Flybridge Memo Generator Tool Overview</strong>
          </p>
          <p>
            The Flybridge memo generator tool is designed to quickly transform
            decks, business plans, and call notes into a first-draft VC
            investment memo. For Founders, we hope this will provide insights
            into how a VC firm might look at your business and streamline the
            process of presenting your company to investors by generating a
            draft memorandum based on the provided context. We recommend giving
            the tool as much context as possible to get the most accurate and
            helpful output. One of the best practices is to record your pitch
            and upload the transcript along with any supporting materials.
          </p>
          <p>
            <strong>Limitations</strong>
          </p>
          <p>
            The memo generator provides a solid draft covering an investor’s key
            considerations. It does have limitations and is a first-step tool
            that gets you about 60% of the way to a final product, with human
            input still needed for nuance and judgment. In other words, use the
            output as a starting point, not a finished memorandum. Also, the
            tool may reflect biases in the input, and its reasoning is limited
            by the capabilities of OpenAI’s o1 model. It is meant for
            informational use only.
          </p>
          <p>
            <strong>
              We kindly request that founders use the tool once, as we aim to
              make it accessible to as many people as possible. By using the
              tool, you accept that Flybridge will see the output memorandum.
            </strong>
          </p>
        </div>
        <form onSubmit={handleSubmit} className="form-container">
          <FileUpload
            documents={documents}
            setDocuments={handleDocumentsChange}
            ocrDocuments={ocrDocuments}
            setOcrDocuments={handleOcrDocumentsChange}
          />
          <DealTerms
            currentRound={currentRound}
            setCurrentRound={setCurrentRound}
            proposedValuation={proposedValuation}
            setProposedValuation={setProposedValuation}
            valuationDate={valuationDate}
            setValuationDate={setValuationDate}
          />
          <FounderInfo
            founderCount={founderCount}
            setFounderCount={setFounderCount}
            maxFounders={maxFounders}
            linkedInUrls={linkedInUrls}
            setLinkedInUrls={setLinkedInUrls}
          />
          <UrlInput url={url} setUrl={setUrl} /> {/* New UrlInput component */}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Generating..." : "Generate Memorandum"}
          </button>
        </form>

        {loading && <LoadingIndicator />}

        {error && <ErrorMessage error={error} />}

        {result && (
          <div>
            <MemorandumDisplay
              result={result}
              cleanHtml={cleanHtml}
              showDownload={showDownload}
              handleDownload={handleDownload}
            />

            {/* Feedback Section */}
            {showFeedback && !feedbackSubmitted && (
              <div className="feedback-section">
                <h3>Please provide your feedback:</h3>
                <button
                  className="btn btn-success"
                  style={{ marginRight: "10px" }}
                  onClick={() => sendFeedback(1)}
                >
                  👍
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => sendFeedback(-1)}
                >
                  👎
                </button>
              </div>
            )}

            {feedbackSubmitted && (
              <div className="feedback-section">
                <h3>Thank you for your feedback!</h3>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
