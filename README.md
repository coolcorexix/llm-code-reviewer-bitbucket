# LLM CODE REVIEW FOR BITBUCKET PR

Suitable for personal usage or in CI/CD pipeline.

## Setup

1. Clone the repository
2. Install the dependencies
3. Create a `.env` file and add the environment variables

# Bitbucket configuration (required)
BITBUCKET_USERNAME=your_username
BITBUCKET_APP_PASSWORD=your_app_password
BITBUCKET_WORKSPACE=your_workspace
BITBUCKET_REPO=your_repo
PR_NUMBER=1234

# AI configuration (required)
AI_API_KEY=your_openai_api_key

# AI configuration (optional)
AI_ENDPOINT=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4

# Prompt configuration (optional)
PROMPT_FILE_PATH=./prompts/review-prompt.txt
