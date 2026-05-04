import asyncio
from core.config import settings
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

async def check_openai_config():
    print(f"Testing configuration...")
    print(f"OPENAI_MODEL from settings: {settings.OPENAI_MODEL}")
    
    if not settings.OPENAI_API_KEY:
        print("❌ OPENAI_API_KEY is not defined in the settings/.env")
        return

    print("✅ OPENAI_API_KEY is present.")
    
    # Initialize the LangChain ChatOpenAI client
    print(f"\nInitializing ChatOpenAI with model: {settings.OPENAI_MODEL}...")
    try:
        llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=0.0
        )
        
        # Test prompt
        prompt = "Respond with briefly: 'The system is working perfectly and the model is configured correctly!'"
        print(f"Sending prompt to the model: '{prompt}'")
        
        # Invoke
        response = llm.invoke([HumanMessage(content=prompt)])
        
        print("\n✅ API Call Successful!")
        print(f"Response from the model:\n{response.content}")
        
    except Exception as e:
        print(f"\n❌ Error during OpenAI API call: {e}")

if __name__ == "__main__":
    asyncio.run(check_openai_config())
