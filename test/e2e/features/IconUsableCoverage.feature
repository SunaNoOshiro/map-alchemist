Feature: Icon Usable Coverage Recovery
  As a product owner validating icon quality recovery
  I want to assert usable icon coverage after generation completes
  So that atlas slicing and retry behavior is verified end-to-end

  Scenario: Atlas mode success reaches full usable coverage
    Given Gemini API calls are mocked with atlas behavior "success"
    And I open the app with icon generation mode "Atlas only"
    When I generate a theme with prompt "Coverage atlas success"
    Then theme generation should complete
    And usable icon summary should report full coverage

  Scenario: Atlas mode hard failures result in zero usable coverage
    Given Gemini API calls are mocked with atlas behavior "error"
    And I open the app with icon generation mode "Atlas only"
    When I generate a theme with prompt "Coverage atlas error"
    Then theme generation should complete
    And usable icon summary should report zero coverage

  Scenario: Atlas mode transient rate-limit still reaches full coverage
    Given Gemini API calls are mocked with atlas behavior "rate-limit-once"
    And I open the app with icon generation mode "Atlas only"
    When I generate a theme with prompt "Coverage atlas transient rate limit"
    Then theme generation should complete
    And usable icon summary should report full coverage

  Scenario: Auto mode recovers full coverage after complete primary-pass failure
    Given Gemini API calls are mocked with atlas behavior "primary-pass-error"
    And I open the app with icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "Coverage auto primary fail"
    Then theme generation should complete
    And usable icon summary should report full coverage

  Scenario: Auto mode recovers full coverage after partial primary-pass failures
    Given Gemini API calls are mocked with atlas behavior "primary-pass-partial"
    And I open the app with icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "Coverage auto primary partial"
    Then theme generation should complete
    And usable icon summary should report full coverage

  Scenario: Auto mode remains partial when the same subset fails both passes
    Given Gemini API calls are mocked with atlas behavior "primary-pass-partial-repair-error"
    And I open the app with icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "Coverage auto partial persists"
    Then theme generation should complete
    And usable icon summary should report partial coverage

  Scenario: Auto mode hard failures across both passes result in zero usable coverage
    Given Gemini API calls are mocked with atlas behavior "error"
    And I open the app with icon generation mode "Auto (HQ Atlas 4x4 + Repair)"
    When I generate a theme with prompt "Coverage auto hard failure"
    Then theme generation should complete
    And usable icon summary should report zero coverage

  Scenario: Batch API success reaches full usable coverage
    Given Gemini API calls are mocked with atlas behavior "success"
    And I open the app with icon generation mode "Batch API (Async, Cheap)"
    When I generate a theme with prompt "Coverage batch success"
    Then theme generation should complete
    And usable icon summary should report full coverage

  Scenario: Batch API create failures result in zero usable coverage
    Given Gemini API calls are mocked with atlas behavior "error"
    And I open the app with icon generation mode "Batch API (Async, Cheap)"
    When I generate a theme with prompt "Coverage batch create fail"
    Then theme generation should complete
    And usable icon summary should report zero coverage
