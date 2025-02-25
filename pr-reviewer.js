import axios from 'axios';
import { Bitbucket } from 'bitbucket';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// Initialize environment variables
dotenv.config();

// Configuration
const config = {
  bitbucket: {
    username: process.env.BITBUCKET_USERNAME,
    password: process.env.BITBUCKET_APP_PASSWORD,
    workspace: process.env.BITBUCKET_WORKSPACE,
    repo: process.env.BITBUCKET_REPO
  },
  ai: {
    apiKey: process.env.AI_API_KEY,
    endpoint: process.env.AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions',
    model: process.env.AI_MODEL || 'gpt-4'
  },
  pr: {
    number: process.env.PR_NUMBER
  },
  prompt: {
    path: process.env.PROMPT_FILE_PATH || './review-prompt.txt'
  }
};

// Initialize the Bitbucket client
const bitbucketClient = new Bitbucket({
  auth: {
    username: config.bitbucket.username,
    password: config.bitbucket.password,
  }
});

// Log auth credentials (partially masked for security)
console.log('Auth credentials:', {
  username: config.bitbucket.username,
  password: config.bitbucket.password?.substring(0, 5) + '...' // Show just first few chars for security
});

// Pure functions for API interactions
const fetchPRDetails = async (workspace, repo, prNumber) => {
  try {
    const { data } = await bitbucketClient.pullrequests.get({
      repo_slug: repo,
      workspace,
      pull_request_id: prNumber
    });
    return data;
  } catch (error) {
    console.error('Error fetching PR details:');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Status: ${error.response.status}`);
      console.error(`Status Text: ${error.response.statusText}`);
      console.error('Response Headers:', error.response.headers);
      console.error('Response Data:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error message:', error.message);
    }
    throw error;
  }
};

const fetchPRDiffs = async (workspace, repo, prNumber) => {
  try {
    const { data } = await bitbucketClient.pullrequests.getDiff({
      repo_slug: repo,
      workspace,
      pull_request_id: prNumber
    });

    // Parse the diff text into an array of file diffs
    return data
      .split('diff --git')
      .filter(Boolean)
      .map(fileDiff => ({
        filename: fileDiff.match(/(?:a\/|b\/)([^\n]+)/)?.[1] ?? 'unknown',
        patch: fileDiff.trim()
      }));
  } catch (error) {
    console.error('Error fetching PR diffs:', error.message);
    throw error;
  }
};

const reviewAllDiffs = async (diffs, bestPracticesPrompt) => {
  try {
    // Format all diffs into a single prompt
    const formattedDiffs = diffs.map(diff => 
      `\n\n### File: ${diff.filename}\n\`\`\`diff\n${diff.patch}\n\`\`\``
    ).join('\n');

    console.log(formattedDiffs);
    
    const response = await axios.post(
      config.ai.endpoint,
      {
        model: config.ai.model,
        messages: [
          {
            role: "system",
            content: bestPracticesPrompt
          },
          {
            role: "user",
            content: `Please review the following code changes from a pull request:\n${formattedDiffs}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${config.ai.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error getting AI review:', error.message);
    throw error;
  }
};

// Main function to review a PR
const reviewPR = async (workspace, repo, prNumber, bestPracticesPrompt) => {
  try {
    // Fetch data in parallel
    const [prDetails, diffs] = await Promise.all([
      fetchPRDetails(workspace, repo, prNumber),
      fetchPRDiffs(workspace, repo, prNumber)
    ]);

    // Log PR information
    console.log(`\nReviewing PR #${prNumber}: ${prDetails.title}\n`);
    console.log('Author:', prDetails.author.display_name);
    console.log('Description:', prDetails.description ?? 'No description provided');
    console.log('\nAI Review Results:\n');

    // Get a single review for all diffs
    const review = await reviewAllDiffs(diffs, bestPracticesPrompt);
    console.log(review);

    return {
      prDetails,
      review
    };
  } catch (error) {
    console.error('Error during PR review:', error.message);
    throw error;
  }
};

// Load prompt from file
const loadPromptFromFile = async (filePath) => {
  try {
    const promptText = await fs.readFile(filePath, 'utf8');
    console.log(`Loaded review prompt from ${filePath}`);
    return promptText;
  } catch (error) {
    console.error(`Error loading prompt from ${filePath}:`, error.message);
    // Return default prompt if file loading fails
    throw new Error(`PLEASE PROVIDE A PROMPT FILE`);
  }
};

// Application entry point with top-level await
try {
  // Validate required environment variables
  const requiredEnvVars = [
    'BITBUCKET_USERNAME', 
    'BITBUCKET_APP_PASSWORD', 
    'BITBUCKET_WORKSPACE', 
    'BITBUCKET_REPO', 
    'PR_NUMBER', 
    'AI_API_KEY'
  ];
  
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  // Load the prompt from file
  const promptFilePath = path.resolve(config.prompt.path);
  const reviewPrompt = await loadPromptFromFile(promptFilePath);

  await reviewPR(
    config.bitbucket.workspace,
    config.bitbucket.repo,
    config.pr.number,
    reviewPrompt
  );
  console.log('\nReview completed successfully.');
} catch (error) {
  console.error('Review process failed:', error);
  process.exit(1);
} 