# main.py
import sys
import json
from crewai import Crew, Agent, Task, Process
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Initialize OpenAI client
openai_client = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), model="gpt-4")

print("Starting market analysis...")

def run_analysis(market_opportunity, trace_id):
    print(f"Analyzing market opportunity: {market_opportunity}")

    # Define your agents
    market_analyst = Agent(
        role='Market Research Analyst',
        goal='Research and analyze market size, growth rate, and competitive landscape',
        backstory='Expert in market research and financial analysis with a focus on AI and technology markets.',
        verbose=True,
        allow_delegation=False,
        llm=openai_client)
    print("Market analyst agent created")

    competitor_analyst = Agent(
        role='Competitor Research Specialist',
        goal='Analyze startup and AI startup competitors, providing detailed insights',
        backstory='Expert in competitive analysis with deep knowledge of the AI startup ecosystem.',
        verbose=True,
        allow_delegation=False,
        llm=openai_client)
    print("Competitor analyst agent created")

    # Define your tasks
    market_task = Task(
        description=f"""Analyze the market size and growth for {market_opportunity}.
        1. Estimate total market size and growth rate (CAGR).
        2. Estimate total number of potential customer's in the target market
        3. Identify top 3 players and their market shares.
        4. List 3 key growth drivers.
        Provide a concise report with clear data points and sources.""",
        expected_output="""A detailed market analysis report including:
        1. Total market size with CAGR
        2. Total number of potential customers
        3. Top 3 players and their market shares
        4. 3 key growth drivers
        All with supporting data and sources.""",
        agent=market_analyst)
    print("Market analysis task created")

    competitor_task = Task(
        description=f"""Analyze the competitive landscape for {market_opportunity}.
        1. Identify 3-4 main AI startup competitors.
        2. For each competitor, provide:
           - Total funding and capital raised. This is super important. Ensure is total funding and not just last round capital
           - Primary offerings and technologies
           - Market position and traction
           - Recent developments
           - Strengths and weaknesses
        Provide a detailed competitor analysis with clear comparisons.""",
        expected_output="""A comprehensive competitor analysis including:
        1. Overview of 3-4 main AI startup competitors
        2. For each competitor:
           -Total funding and capital raised. This is super important 
           - Detailed description of offerings and technologies
           - Current market position and traction metrics
           - Recent significant developments
           - Analysis of strengths and weaknesses
        With a clear comparison between competitors.""",
        agent=competitor_analyst)
    print("Competitor analysis task created")

    # Create the crew
    crew = Crew(
        agents=[market_analyst, competitor_analyst],
        tasks=[market_task, competitor_task],
        verbose=True,
        process=Process.sequential
    )
    print("Crew created, starting analysis...")

    # Run the crew
    result = crew.kickoff()
    print("Analysis completed")

    return result

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Please provide the market opportunity and trace ID as arguments.")
        sys.exit(1)

    market_opportunity = sys.argv[1]
    trace_id = sys.argv[2]
    result = run_analysis(market_opportunity, trace_id)

    # Attempt to access 'final_answer' directly from TaskOutput
    market_analysis_output = getattr(result.tasks_output[0], 'final_answer', None)
    competitor_analysis_output = getattr(result.tasks_output[1], 'final_answer', None)

    # If 'final_answer' is None, try 'raw'
    if market_analysis_output is None:
        market_analysis_output = getattr(result.tasks_output[0], 'raw', None)

    if competitor_analysis_output is None:
        competitor_analysis_output = getattr(result.tasks_output[1], 'raw', None)

    # Check if outputs were successfully retrieved
    if market_analysis_output is None or competitor_analysis_output is None:
        print("Error: Could not retrieve task outputs.")
        sys.exit(1)

    output = {
        "market_analysis": market_analysis_output,
        "competitor_analysis": competitor_analysis_output,
        "trace_id": trace_id
    }
    print("Final output:", json.dumps(output))
    print(json.dumps(output))