---
name: ui-integration
description: Use this skill when connecting the Stitch-generated HTML 
frontend screens to backend API endpoints. Use when wiring up buttons, 
form submissions, file uploads, fetch calls, or any interaction between 
the frontend screens and the server. Also use when adding JavaScript 
event listeners to existing HTML elements without altering their design.
---

# UI Integration Skill

## Goal
Connect the four static Stitch-generated HTML screens to live backend 
logic without modifying any Tailwind classes, color values, or layout 
structure. Functionality is added on top — design is never touched.

## Context
The frontend lives in /frontend. There are 4 screens:
- screen1-upload.html — car photo upload + vehicle template selection
- screen2-studio.html — wrap finish/color selection + text prompt input
- screen3-quote.html — quote breakdown + WhatsApp CTA + M-Pesa deposit
- screen4-confirmation.html — booking success state

## Instructions

### When wiring a button or form:
1. Locate the exact HTML element by its existing class or aria label
2. Add a unique id attribute to the element if one does not exist
3. Create a new <script> block at the bottom of the HTML file 
   (before </body>) — never inline scripts in element attributes
4. Write the event listener targeting that id
5. Use fetch() to call the appropriate /api/ endpoint
6. On success: update only the text content or visibility of 
   result elements — never alter class names
7. On error: display a user-visible message in an existing 
   error container element

### File Upload (Screen 1):
- The file input already exists. Add a change event listener.
- On file select: show a loading spinner by setting an existing 
  element's display to 'flex'
- Send the image as FormData to POST /api/segment
- On response: update the vehicle preview image src in Screen 2
- Store the segmented image URL in sessionStorage as 'segmented_image'

### Design Selection (Screen 2):
- Finish buttons: add click listeners to each finish card
- On click: store selected finish in sessionStorage as 'selected_finish'
- Color swatches: on click: store hex value as 'selected_color'
- Text prompt input: on send button click, store value as 'design_prompt'
- "GET MY QUOTE" button: navigate to screen3-quote.html, 
  passing sessionStorage values forward

### Quote Screen (Screen 3):
- On page load: read sessionStorage values and populate the 
  vehicle name, finish name, and price breakdown
- PPF toggle: on change, recalculate and update the total display
- WhatsApp button: call the whatsapp-bridge skill logic
- M-Pesa button: call the mpesa-deposit skill logic

## Constraints
- Never remove or rename existing HTML elements
- Never modify any Tailwind class
- Never use document.write()
- All sessionStorage keys must use the prefix 'wv_' 
  (e.g., 'wv_selected_finish')
