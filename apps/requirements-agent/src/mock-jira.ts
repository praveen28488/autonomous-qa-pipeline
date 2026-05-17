// Mock Jira stories used when real Jira credentials are not configured.
// Replace with real MCP calls once JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN are set.
export const MOCK_JIRA_STORIES = [
  {
    id: 'QA-101',
    key: 'QA-101',
    fields: {
      summary: 'User can log in with valid credentials',
      description: 'Standard login flow with email and password authentication',
      customfield_10016: `Given the user is on the login page
When they enter a valid email and password
Then they should be redirected to the dashboard
And their name should be displayed in the header`,
      priority: { name: 'High' },
      labels: ['authentication', 'smoke'],
    },
  },
  {
    id: 'QA-102',
    key: 'QA-102',
    fields: {
      summary: 'User sees error message on invalid login',
      description: 'When wrong credentials are entered the system should display a clear error',
      customfield_10016: `Given the user is on the login page
When they enter an invalid email or wrong password
Then they should see an error message saying "Invalid credentials"
And they should remain on the login page`,
      priority: { name: 'High' },
      labels: ['authentication', 'error-handling'],
    },
  },
  {
    id: 'QA-103',
    key: 'QA-103',
    fields: {
      summary: 'User can reset password via email link',
      description: 'Forgot password flow sends a reset link to the registered email address',
      customfield_10016: `Given the user has forgotten their password
When they click "Forgot password" and enter their email
Then they should receive a password reset email within 2 minutes
And clicking the link should allow them to set a new password`,
      priority: { name: 'Medium' },
      labels: ['authentication', 'password-reset'],
    },
  },
  {
    id: 'QA-104',
    key: 'QA-104',
    fields: {
      summary: 'User can view their profile page',
      description: 'Authenticated users should be able to view and edit their profile details',
      customfield_10016: `Given the user is logged in
When they navigate to the profile page
Then they should see their name, email, and avatar
And they should be able to edit their display name`,
      priority: { name: 'Medium' },
      labels: ['profile', 'e2e'],
    },
  },
  {
    id: 'QA-105',
    key: 'QA-105',
    fields: {
      summary: 'Story',
      description: '',
      customfield_10016: 'it works',
      priority: { name: 'Low' },
      labels: [],
    },
  },
];
