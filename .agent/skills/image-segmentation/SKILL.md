---
name: image-segmentation
description: Use this skill when building or modifying the AI image 
segmentation feature — the backend endpoint that receives a car photo, 
sends it to the Replicate SAM API, receives a masked result isolating 
the car body panels from windows, tyres, and background, and returns 
the processed image URL to the frontend.
---

# Image Segmentation Skill

## Goal
Build a single Express endpoint POST /api/segment that accepts a car 
photo upload, processes it through the Segment Anything Model (SAM) 
via the Replicate API, and returns a JSON response containing the 
masked image URL ready for wrap overlay on the frontend.

## Stack
- Runtime: Node.js with Express
- File handling: multer (multipart/form-data)
- AI Model: Replicate API — model: 
  "facebookresearch/segment-anything-2"
- File location: backend/routes/segment.js

## Instructions

### Endpoint Structure:
1. Accept POST /api/segment with multipart/form-data
2. Use multer with memoryStorage (do not write files to disk)
3. Convert the buffer to base64
4. Send to Replicate API with these parameters:
   - input.image: the base64 image string
   - input.multimask_output: false
   - input.return_logits: false
   - The prompt point should target the center of the image 
     as the initial click point: input.point_coords: [[50, 50]]
     input.point_labels: [1]
5. Poll the Replicate prediction until status is "succeeded"
6. Extract the output URL (the masked image)
7. Return JSON: { success: true, maskedImageUrl: "...", 
   vehicleArea: estimated_coverage_percentage }

### Environment Variables Required:
- REPLICATE_API_TOKEN — from Replicate dashboard
- Store in .env, never commit to git

### Error Handling:
- If file size > 10MB: return 400 with message 
  "Please upload a smaller image (max 10MB)"
- If Replicate times out after 30s: return 503 with message 
  "AI processing is taking longer than usual. Please try again."
- If no vehicle detected (empty mask): return 422 with message 
  "We couldn't detect a vehicle in this photo. 
   Please upload a clear side or front view."

### Response Format:
{
  "success": true,
  "maskedImageUrl": "https://replicate.delivery/...",
  "vehicleArea": 68,
  "processingTime": 4200
}

## Constraints
- Never store uploaded images permanently
- Never log base64 strings to console (too large, security risk)
- multer memory limit must be set to 10MB maximum
- The endpoint must respond within 45 seconds or time out gracefully
