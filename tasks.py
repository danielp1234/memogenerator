# tasks.py
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


def run_analysis(market_opportunity):
    print(f"Analyzing market opportunity: {market_opportunity}")

    # Define your agents
    market_analyst = Agent(
        role='Market Research Analyst',
        goal=
        'Research and analyze market size, growth rate, and competitive landscape',
        backstory=
        'Expert in market research and financial analysis with a focus on AI and technology markets in 2024. Known for providing detialed market analysis with accurate data and insights from reliable sources',
        verbose=True,
        allow_delegation=False,
        llm=openai_client)
    print("Market analyst agent created")

    competitor_analyst = Agent(
        role='Competitor Research Specialist',
        goal=
        'Analyze startup and AI startup competitors, providing detailed insights',
        backstory=
        'Expert in competitive analysis with deep knowledge of the AI startup ecosystem. Specialized in tracking funding rounds, value porposition and market positioning. It is especially good in finding highly relevant competitors and not just adjacent players',
        verbose=True,
        allow_delegation=False,
        llm=openai_client)
    print("Competitor analyst agent created")

    # Define your tasks
    market_task = Task(
        description=
        f"""Analyze the market size in 2024 and growth for {market_opportunity}.
        1. Total market size (TAM) with clear calculation methodology
        2. Current market growth rate (CAGR) with supporting data
        3. Estimate total number of potential customer's in the target market
        4. List 3 key growth drivers in the space.
        Provide a concise report with clear data points and sources.""",
        agent=market_analyst)
    print("Market analysis task created")

    competitor_task = Task(
        description=
        f"""Identify and analyze the competitive landscape for {market_opportunity}.
        1. Identify 4-5 main AI startup competitors.
        2. For each competitor, provide:
           - Primary offerings and technologies
           - Market traction and key metrics
           - Recent developments
           - Competitive advantages and weaknesses
           - Total funding raised and latest valuation
           - Recent developments and strategic moves
        Provide a detailed competitor analysis with clear comparisons.""",
        agent=competitor_analyst)
    print("Competitor analysis task created")

    # Create the crew
    crew = Crew(agents=[market_analyst, competitor_analyst],
                tasks=[market_task, competitor_task],
                verbose=True,
                process=Process.sequential)
    print("Crew created, starting analysis...")

    # Run the crew
    result = crew.kickoff()
    print("Analysis completed")

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Please provide the market opportunity as an argument.")
        sys.exit(1)

    market_opportunity = sys.argv[1]
    result = run_analysis(market_opportunity)

    output = {
        "market_analysis": result.task_output[0],
        "competitor_analysis": result.task_output[1]
    }
    print("Final output:", json.dumps(output))
    print(json.dumps(output))
