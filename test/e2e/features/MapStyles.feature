Feature: Map Style Interaction
  As a map enthusiast
  I want to switch map styles and interact with POIs
  So that I can explore different themes and customize them

  Background:
    Given I am on the home page
    And I have custom "Pirates" and "Cartoon" themes injected

  Scenario: Switching styles and interacting with map features
    When I select the "pirates map of treasures (Custom)" style
    Then the map should be visible
    And the style "pirates map of treasures (Custom)" should be active

    When I click on a visible POI on the map
    Then a popup should be visible
    And the popup should contain a close button
    And the popup should contain an image
    And the popup should contain location details text
    And POI labels should read text color from feature properties

  Scenario: Verifying icon scaling and theme switching
    Then POI icons should scale correctly with zoom level

    When I have a popup open for a POI
    And I switch to the "in style of cartoon (Custom)" style
    Then the popup should still be visible or accessible
    And the popup should contain an image

  Scenario: Verifying Remix functionality
    When I select the "pirates map of treasures (Custom)" style
    And I click on a visible POI on the map
    And I click the Remix button in the popup
    Then the icon edit sidebar should be open
