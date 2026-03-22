Feature: Map Style Interaction
  As a map enthusiast
  I want to switch map styles and interact with POIs
  So that I can explore different themes and customize them

  Background:
    Given I am on the home page
    And external POI detail APIs are mocked
    And I have custom "Pirates" and "Cartoon" themes injected

  Scenario: Switching styles and interacting with map features
    When I select the "pirates map of treasures (Custom)" style
    Then the map should be visible
    And the style "pirates map of treasures (Custom)" should be active

    When I click on a visible POI on the map
    Then a popup should be visible
    And the popup should stay compact
    And the popup should remain inside the map viewport
    And the popup should show a themed loading state before enriched details arrive
    And the popup should contain a close button
    And the popup should contain an image
    And the popup photo should fall back to the next available source
    And the popup should contain location details text
    And the popup should contain enriched place details
    And the popup should contain a Google Maps search link
    And the popup should contain an exact location link
    And the popup should contain an OpenStreetMap link
    And the popup should contain a Wikipedia link
    And the popup action buttons should use balanced sizing
    And POI labels should read text color from feature properties

  Scenario: POIs should appear without zooming after load
    When I select the "pirates map of treasures (Custom)" style
    Then the map should be visible
    And POIs should appear without zooming after load

  Scenario: Searching loaded POIs by name and category
    When I select the "pirates map of treasures (Custom)" style
    Then the map should be visible
    When I click on a visible POI on the map
    Then a popup should be visible
    When I switch the right sidebar to Places
    And I search loaded POIs for the last clicked POI title
    And I select the category filter matching the last clicked POI
    And I select the subcategory filter matching the last clicked POI
    Then POI search results should contain the last clicked POI title
    When I close the popup
    And I click the first POI search result
    Then a popup should be visible
    And the popup should mention the last clicked POI title

  Scenario: Filtering loaded POIs by metadata
    When I select the "pirates map of treasures (Custom)" style
    Then the map should be visible
    When I switch the right sidebar to Places
    And I freeze POI search time to "2026-03-15T10:00:00Z"
    And I select the first available specific POI category filter
    Then POI search results should all match the selected category filter
    When I reset POI search filters
    And I enable the "Has photo" POI filter
    Then POI search results should satisfy the "Has photo" filter
    When I reset POI search filters
    And I enable the "Has website" POI filter
    Then POI search results should satisfy the "Has website" filter
    When I reset POI search filters
    And I enable the "Open now" POI filter
    Then POI search results should satisfy the "Open now" filter

  Scenario: Persisting loaded POIs across map panning
    When I select the "pirates map of treasures (Custom)" style
    Then the map should be visible
    When I switch the right sidebar to Places
    And I remember the current loaded POI count
    And I pan the map far away
    Then the loaded POI count should not shrink

  Scenario: Hiding and showing POI categories on the map
    When I select the "pirates map of treasures (Custom)" style
    Then the map should be visible
    When I click on a visible POI on the map
    Then a popup should be visible
    When I switch the right sidebar to Places
    And I search loaded POIs for the last clicked POI title
    And I hide the category matching the last clicked POI from the map
    Then the matching POI search result should be loaded but not visible
    When I show the category matching the last clicked POI on the map
    Then the matching POI search result should be visible again

  Scenario: Syncing map visibility controls between Icons and Places
    When I select the "pirates map of treasures (Custom)" style
    Then the map should be visible
    When I click on a visible POI on the map
    Then a popup should be visible
    When I switch the right sidebar to Icons
    And I hide the category matching the last clicked POI from the map using the Icons panel
    And I switch the right sidebar to Places
    And I search loaded POIs for the last clicked POI title
    Then the matching POI search result should be loaded but not visible
    When I switch the right sidebar to Icons
    And I show only the category matching the last clicked POI from the map using the Icons panel
    And I switch the right sidebar to Places
    Then the matching POI search result should be visible again
    When I switch the right sidebar to Icons
    And I show only the category matching the last clicked POI from the map using the Icons panel
    And I switch the right sidebar to Places
    Then the matching POI search result should be loaded but not visible
    When I switch the right sidebar to Icons
    And I reset map visibility from the Icons panel
    And I switch the right sidebar to Places
    Then the matching POI search result should be visible again

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

  Scenario: Dismissing popup when zooming the map
    When I select the "pirates map of treasures (Custom)" style
    And I click on a visible POI on the map
    Then a popup should be visible
    When I zoom the map
    Then the popup should be dismissed

  Scenario: Keeping popup visible near the top edge of the map
    When I select the "pirates map of treasures (Custom)" style
    And I click on a visible POI near the top edge of the map
    Then a popup should be visible
    And the popup should remain inside the map viewport

  Scenario: Opening a popup should not reset the map view
    When I select the "pirates map of treasures (Custom)" style
    And I remember the current map view
    And I click on a visible POI on the map
    Then a popup should be visible
    And the popup should remain inside the map viewport
    And the map view should remain stable after opening the popup

  Scenario: Restoring the selected theme cleanly after reload
    When I select the "in style of cartoon (Custom)" style
    And I start tracking bootstrap behavior across a reload
    And I reload the page
    Then the auth start screen should not flash during reload
    And the active map theme should restore directly to "in style of cartoon (Custom)"
    And the initial map reveal veil should be dismissed
    And the map should be visible

  Scenario: Keeping popup close accessible on mobile
    When I emulate a mobile viewport
    And I select the "pirates map of treasures (Custom)" style
    Then the map should be visible
    When I click on a visible POI on the map
    Then a popup should be visible
    And the popup close button should remain tappable on mobile
