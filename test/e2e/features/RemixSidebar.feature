Feature: Remix Sidebar Focus
  As a User
  I want remix actions to focus the correct icon
  So that I can edit icons without losing scroll behavior

  Scenario: Desktop remix focus aligns the selected icon to the top and allows scrolling
    Given I am on the home page
    And I have custom "Pirates" and "Cartoon" themes injected
    And I set the viewport to "desktop"
    When I click a visible POI on the map
    Then I should see the POI popup
    When I click remix in the POI popup
    Then the popup category icon should be aligned to the top of the icon list
    And only the selected icon group should be expanded
    When I scroll the icon list by 300
    Then the icon list scroll position should be greater than 0
    When I scroll the icon list by -200
    Then the icon list scroll position should be lower than before

  Scenario: Mobile remix focus opens the icon list and aligns the selected icon
    Given I am on the home page
    And I have custom "Pirates" and "Cartoon" themes injected
    And I set the viewport to "mobile"
    When I click a visible POI on the map
    Then I should see the POI popup
    When I click remix in the POI popup
    Then the popup category icon should be aligned to the top of the icon list
    And only the selected icon group should be expanded

  Scenario: Selecting another icon after remix focus should replace the selected editor
    Given I am on the home page
    And I have custom "Pirates" and "Cartoon" themes injected
    And I set the viewport to "desktop"
    And I open the icon assets sidebar
    When I trigger remix focus for category "Cafe"
    Then the icon item "Cafe" should be aligned to the top of the icon list
    When I click the icon item "Bar"
    Then the icon item "Bar" should be selected for editing
    And the icon item "Cafe" should no longer be selected for editing

  Scenario: Selecting another icon after popup remix focus should not snap back to the first selection
    Given I am on the home page
    And I have custom "Pirates" and "Cartoon" themes injected
    And I set the viewport to "desktop"
    When I click a visible POI on the map
    Then I should see the POI popup
    When I click remix in the POI popup
    And I scroll the icon list by 300
    Then the icon list scroll position should be greater than 0
    When I click a different icon item in the selected group
    Then the replacement icon item should be selected for editing
