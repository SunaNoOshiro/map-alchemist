Feature: Sidebar Interaction
  As a User
  I want to interact with the sidebars
  So that I can notice that the sidebars are interactive

  Scenario: Collapsing and expanding sidebar sections
    Given I am on the home page
    And I have custom "Pirates" and "Cartoon" themes injected

    When I click the section header "Theme Generator"
    Then the section "Theme Generator" should be collapsed
    When I click the section header "Theme Generator"
    Then the section "Theme Generator" should be expanded

  Scenario: Interacting with Right Sidebar Categories
    Given I am on the home page
    And I have custom "Pirates" and "Cartoon" themes injected

    When I click the category group "Food & Drink"
    Then the category group "Food & Drink" should be collapsed
    When I click the category group "Food & Drink"
    Then the category group "Food & Drink" should be expanded
