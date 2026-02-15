Feature: Maputnik Publish Modal
  As a style creator
  I want the publish modal to be fully usable and provide embed outputs
  So that I can publish and integrate styles without blocking dialogs

  Background:
    Given I am on the home page
    And I have custom "Pirates" and "Cartoon" themes injected
    And GitHub publish settings are prefilled
    And browser dialogs are tracked
    And GitHub API is mocked for publish success

  Scenario: Publishing Maputnik assets shows complete modal content and embed outputs
    When I open the Maputnik publish modal
    Then the Maputnik publish modal should be fully visible in the viewport
    And the demo POIs toggle should be visible
    When I publish assets from the Maputnik modal
    Then publish results should include style URL runtime URL and embed snippet
    And the embed snippet should enable popup and POI color labels by default
    And the publish modal content should be scrollable to the instructions block
    And no browser dialogs should appear during publish
