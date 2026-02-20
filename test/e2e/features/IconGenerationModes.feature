Feature: Icon Generation Mode Invocation Accounting
  As a product owner controlling AI spend
  I want deterministic invocation counts per icon generation mode
  So that I can validate cost behavior before running large generations

  Scenario: Per-icon mode is capped to control API spend
    Given Gemini API calls are mocked with atlas behavior "error"
    And I open the app with icon generation mode "Per-icon only"
    When I generate a theme with prompt "BDD per icon mode"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 0 per-icon 32 total 33
    And Gemini unknown invocations should be 0

  Scenario: Atlas mode does not fallback to per-icon requests when atlas fails
    Given Gemini API calls are mocked with atlas behavior "error"
    And I open the app with icon generation mode "Atlas only"
    When I generate a theme with prompt "BDD atlas mode"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 3 per-icon 0 total 4
    And Gemini unknown invocations should be 0

  Scenario: Auto mode caps per-icon fallback when atlas fails
    Given Gemini API calls are mocked with atlas behavior "error"
    And I open the app with icon generation mode "Auto (Atlas + Fallback)"
    When I generate a theme with prompt "BDD auto mode fallback cap"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 3 per-icon 24 total 28
    And Gemini per-icon invocations should be at most 24
    And Gemini unknown invocations should be 0

  Scenario: Auto mode stays atlas-only when atlas succeeds
    Given Gemini API calls are mocked with atlas behavior "success"
    And I open the app with icon generation mode "Auto (Atlas + Fallback)"
    When I generate a theme with prompt "BDD auto atlas success"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 3 per-icon 0 total 4
    And Gemini unknown invocations should be 0
