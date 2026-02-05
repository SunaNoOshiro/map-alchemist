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
    Then the icon list scroll position should be less than 300

  Scenario: Mobile remix focus opens the icon list and aligns the selected icon
    Given I am on the home page
    And I have custom "Pirates" and "Cartoon" themes injected
    And I set the viewport to "mobile"
    When I click a visible POI on the map
    Then I should see the POI popup
    When I click remix in the POI popup
    Then the popup category icon should be aligned to the top of the icon list
    And only the selected icon group should be expanded
