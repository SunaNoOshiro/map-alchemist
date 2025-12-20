Feature: Map Generation
  As a map enthusiast
  I want to generate custom map themes using AI
  So that I can visualize different styles on a map

  Scenario: Generating a new map theme successfully
    Given I have a valid API key connected
    When I enter a prompt "Cyberpunk neon city"
    And I click the "Generate Theme" button
    Then a new map theme should be created
    And the map should display the new theme colors
    And custom icons should be generated for map categories
