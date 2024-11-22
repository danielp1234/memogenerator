# agents.py
import os
from crewai import Agent
from langchain_openai import ChatOpenAI
from langchain.tools import Tool
from typing import List, Optional, Any
import requests
import time
from functools import lru_cache

# Initialize OpenAI
openai_client = ChatOpenAI(model="gpt-4")


# Implement improved caching for Perplexity search
@lru_cache(maxsize=100)
def cached_perplexity_search(query: str) -> str:
    return perplexity_search(query)


# Optimized Perplexity search function
def perplexity_search(query: str, max_retries: int = 3) -> str:
    for attempt in range(max_retries):
        try:
            url = "https://api.perplexity.ai/chat/completions"
            payload = {
                "model":
                "llama-3.1-sonar-huge-128k-online",
                "messages": [{
                    "role": "system",
                    "content": "Be precise and concise."
                }, {
                    "role":
                    "user",
                    "content":
                    f"Search for recent and accurate market data on: {query}. Focus on reputable sources and provide specific numbers and statistics when available."
                }]
            }
            headers = {
                "Authorization": f"Bearer {os.getenv('PERPLEXITY_API_KEY')}",
                "accept": "application/json",
                "content-type": "application/json"
            }
            response = requests.post(url, json=payload, headers=headers)
            return response.json()['choices'][0]["message"]["content"]
        except Exception as e:
            if attempt == max_retries - 1:
                return f"An error occurred while performing the search: {str(e)}"
            time.sleep(2**attempt)  # Exponential backoff


# Define the optimized Perplexity search tool
perplexity_search_tool = Tool(
    name="Perplexity Web Search",
    func=cached_perplexity_search,
    description=
    "Searches the web for current market information. Input: search query string."
)


# Optimized market size estimation tool
def estimate_market_size(data: str) -> str:
    # Implement a more efficient market size estimation logic
    # This is a placeholder - replace with actual implementation
    return f"Estimated market size based on: {data}"


market_size_tool = Tool(
    name="Market Size Estimator",
    func=estimate_market_size,
    description="Estimates market size based on provided data.")


# Optimized CAGR calculation tool
def calculate_cagr(initial_value: float, final_value: float,
                   num_years: int) -> float:
    return (final_value / initial_value)**(1 / num_years) - 1


cagr_tool = Tool(
    name="CAGR Calculator",
    func=calculate_cagr,
    description=
    "Calculates CAGR given initial value, final value, and number of years.")

# Combined Market Research and Analysis Agent
market_analyst = Agent(
    role='Market Research Analyst',
    goal=
    'Research and analyze market size, growth rate, and competitive landscape',
    backstory=
    'Expert in market research and financial analysis with a focus on AI and technology markets.',
    verbose=True,
    allow_delegation=False,
    tools=[perplexity_search_tool, market_size_tool, cagr_tool],
    llm=openai_client)

# Competitor Research Agent
competitor_analyst = Agent(
    role='Competitor Research Specialist',
    goal=
    'Analyze startup and AI startup competitors, providing detailed insights including total capital raised',
    backstory=
    'Expert in competitive analysis with deep knowledge of the AI startup ecosystem.',
    verbose=True,
    allow_delegation=False,
    tools=[perplexity_search_tool],
    llm=openai_client)

# Custom Manager Agent
custom_manager = Agent(
    role='Project Coordinator',
    goal='Coordinate and optimize the market analysis process',
    backstory=
    'Experienced in managing complex research projects with a focus on efficiency.',
    verbose=True,
    allow_delegation=True,
    llm=openai_client)
