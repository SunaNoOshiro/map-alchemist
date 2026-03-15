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
    And Gemini batch invocations should be create 0 poll 0 delete 0
    And Gemini unknown invocations should be 0

  Scenario: Atlas mode does not fallback to per-icon requests when atlas fails
    Given Gemini API calls are mocked with atlas behavior "error"
    And I open the app with icon generation mode "Atlas only"
    When I generate a theme with prompt "BDD atlas mode"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 9 per-icon 0 total 10
    And Gemini batch invocations should be create 0 poll 0 delete 0
    And Gemini unknown invocations should be 0

  Scenario: Atlas mode baseline success stays atlas-only
    Given Gemini API calls are mocked with atlas behavior "success"
    And I open the app with icon generation mode "Atlas only"
    When I generate a theme with prompt "BDD atlas success mode"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 9 per-icon 0 total 10
    And Gemini batch invocations should be create 0 poll 0 delete 0
    And Gemini unknown invocations should be 0

  Scenario: Atlas mode retries inside image call on one transient 429
    Given Gemini API calls are mocked with atlas behavior "rate-limit-once"
    And I open the app with icon generation mode "Atlas only"
    When I generate a theme with prompt "BDD atlas transient 429"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 10 per-icon 0 total 11
    And Gemini batch invocations should be create 0 poll 0 delete 0
    And Gemini unknown invocations should be 0

  Scenario: Auto mode uses one async atlas batch when primary pass succeeds
    Given Gemini API calls are mocked with atlas behavior "success"
    And I open the app with icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "BDD auto primary success"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 0 per-icon 0 total 4
    And Gemini batch invocations should be create 1 poll 1 delete 1
    And Gemini per-icon invocations should be at most 0
    And Gemini unknown invocations should be 0

  Scenario: Auto mode retries all failed icons via atlas repair pass
    Given Gemini API calls are mocked with atlas behavior "primary-pass-error"
    And I open the app with icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "BDD auto full primary fail then repair"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 0 per-icon 0 total 7
    And Gemini batch invocations should be create 2 poll 2 delete 2
    And Gemini per-icon invocations should be at most 0
    And Gemini unknown invocations should be 0

  Scenario: Auto mode retries only failed subset when primary pass is partial
    Given Gemini API calls are mocked with atlas behavior "primary-pass-partial"
    And I open the app with icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "BDD auto partial repair"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 0 per-icon 0 total 7
    And Gemini batch invocations should be create 2 poll 2 delete 2
    And Gemini per-icon invocations should be at most 0
    And Gemini unknown invocations should be 0

  Scenario: Auto mode remains async-atlas-batch-only when partial failures persist after repair
    Given Gemini API calls are mocked with atlas behavior "primary-pass-partial-repair-error"
    And I open the app with icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "BDD auto partial fails both passes"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 0 per-icon 0 total 7
    And Gemini batch invocations should be create 2 poll 2 delete 2
    And Gemini per-icon invocations should be at most 0
    And Gemini unknown invocations should be 0

  Scenario: Batch API mode uses only async batch requests
    Given Gemini API calls are mocked with atlas behavior "success"
    And I open the app with icon generation mode "Batch API (Async, Cheap)"
    When I generate a theme with prompt "BDD batch mode"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 0 per-icon 0 total 19
    And Gemini batch invocations should be create 6 poll 6 delete 6
    And Gemini unknown invocations should be 0

  Scenario: Batch API mode keeps atlas/per-icon at zero when async batch create fails
    Given Gemini API calls are mocked with atlas behavior "error"
    And I open the app with icon generation mode "Batch API (Async, Cheap)"
    When I generate a theme with prompt "BDD batch create failures"
    Then theme generation should complete
    And Gemini invocations should be visuals 1 atlas 0 per-icon 0 total 9
    And Gemini batch invocations should be create 8 poll 0 delete 0
    And Gemini unknown invocations should be 0

  Scenario: OpenAI provider per-icon mode is capped to control API spend
    Given OpenAI API calls are mocked
    And I open the app with provider "openai" and icon generation mode "Per-icon only"
    When I generate a theme with prompt "BDD openai per icon mode"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 32 total 33
    And OpenAI classified image invocations should be atlas 0 per-icon 32
    And OpenAI unknown invocations should be 0

  Scenario: OpenAI atlas mode baseline success stays atlas-only
    Given OpenAI API calls are mocked with atlas behavior "success"
    And I open the app with provider "openai" and icon generation mode "Atlas only"
    When I generate a theme with prompt "BDD openai atlas success mode"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 9 total 10
    And OpenAI classified image invocations should be atlas 9 per-icon 0
    And OpenAI batch invocations should be create 0 poll 0 file-upload 0 file-content 0
    And OpenAI unknown invocations should be 0

  Scenario: OpenAI atlas mode does not fallback to per-icon requests when atlas fails
    Given OpenAI API calls are mocked with atlas behavior "error"
    And I open the app with provider "openai" and icon generation mode "Atlas only"
    When I generate a theme with prompt "BDD openai atlas error mode"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 9 total 10
    And OpenAI classified image invocations should be atlas 9 per-icon 0
    And OpenAI batch invocations should be create 0 poll 0 file-upload 0 file-content 0
    And OpenAI unknown invocations should be 0

  Scenario: OpenAI atlas mode retries inside image call on one transient 429
    Given OpenAI API calls are mocked with atlas behavior "rate-limit-once"
    And I open the app with provider "openai" and icon generation mode "Atlas only"
    When I generate a theme with prompt "BDD openai atlas transient 429"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 10 total 11
    And OpenAI classified image invocations should be atlas 10 per-icon 0
    And OpenAI batch invocations should be create 0 poll 0 file-upload 0 file-content 0
    And OpenAI unknown invocations should be 0

  Scenario: OpenAI auto mode uses atlas requests only when primary pass succeeds
    Given OpenAI API calls are mocked with atlas behavior "success"
    And I open the app with provider "openai" and icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "BDD openai auto primary success"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 0 total 1
    And OpenAI classified image invocations should be atlas 9 per-icon 0
    And OpenAI batch invocations should be create 1 poll 1 file-upload 1 file-content 1
    And OpenAI unknown invocations should be 0

  Scenario: OpenAI auto mode retries all failed icons via atlas repair pass
    Given OpenAI API calls are mocked with atlas behavior "primary-pass-error"
    And I open the app with provider "openai" and icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "BDD openai auto full primary fail then repair"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 0 total 1
    And OpenAI classified image invocations should be atlas 18 per-icon 0
    And OpenAI batch invocations should be create 2 poll 2 file-upload 2 file-content 2
    And OpenAI unknown invocations should be 0

  Scenario: OpenAI auto mode retries only failed subset when primary pass is partial
    Given OpenAI API calls are mocked with atlas behavior "primary-pass-partial"
    And I open the app with provider "openai" and icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "BDD openai auto partial repair"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 0 total 1
    And OpenAI classified image invocations should be atlas 13 per-icon 0
    And OpenAI batch invocations should be create 2 poll 2 file-upload 2 file-content 2
    And OpenAI unknown invocations should be 0

  Scenario: OpenAI auto mode remains async-atlas-batch-only when partial failures persist after repair
    Given OpenAI API calls are mocked with atlas behavior "primary-pass-partial-repair-error"
    And I open the app with provider "openai" and icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "BDD openai auto partial fails both passes"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 0 total 1
    And OpenAI classified image invocations should be atlas 13 per-icon 0
    And OpenAI batch invocations should be create 2 poll 2 file-upload 2 file-content 2
    And OpenAI unknown invocations should be 0

  Scenario: OpenAI batch mode uses per-icon requests only
    Given OpenAI API calls are mocked with atlas behavior "success"
    And I open the app with provider "openai" and icon generation mode "Batch API (Async, Cheap)"
    When I generate a theme with prompt "BDD openai batch mode"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 0 total 1
    And OpenAI classified image invocations should be atlas 0 per-icon 139
    And OpenAI batch invocations should be create 6 poll 6 file-upload 6 file-content 6
    And OpenAI unknown invocations should be 0

  Scenario: OpenAI batch mode keeps direct image calls at zero when async batch create fails
    Given OpenAI API calls are mocked with atlas behavior "error"
    And I open the app with provider "openai" and icon generation mode "Batch API (Async, Cheap)"
    When I generate a theme with prompt "BDD openai batch create failures"
    Then theme generation should complete
    And OpenAI invocations should be text 1 image 0 total 1
    And OpenAI classified image invocations should be atlas 0 per-icon 0
    And OpenAI batch invocations should be create 8 poll 0 file-upload 8 file-content 0
    And OpenAI unknown invocations should be 0
