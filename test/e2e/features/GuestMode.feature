Feature: Guest Mode
  As a visitor without an API key
  I want to explore the app in read-only mode
  So that I can see what it does before committing

  Scenario: Entering Guest Mode and verifying restrictions
    Given I am on the home page
    When I click the "Continue as Guest" button
    Then the "Theme Generator" section should show a "Guest Mode" message
    And the "Set Up API Key" button should be visible in the prompt panel

  Scenario: Switching icon generation mode and persisting it
    Given I am on the home page
    When I set icon generation mode to "Atlas only"
    Then icon generation mode should be "Atlas only"
    When I click the "Continue as Guest" button
    Then icon generation mode should be "Atlas only"
    When I reload the page
    Then icon generation mode should be "Atlas only"
