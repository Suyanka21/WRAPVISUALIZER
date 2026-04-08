# Car Image Inconsistencies

Audit of all vehicle images used in the frontend. Each image was visually verified by opening its Unsplash URL directly.

---

## Template Card Images (screen1-upload.html) — CRITICAL

These images are tied to specific vehicle models in the pricing system. Users click these to start the estimate flow, so accuracy matters.

| # | Label in UI | Expected Vehicle | Actual Image Shows | Unsplash URL | Issue |
|---|------------|-----------------|-------------------|-------------|-------|
| 1 | Toyota Land Cruiser V8/LC300 | Toyota Land Cruiser V8 or LC300 (large SUV) | **IMAGE BROKEN (404)** | `photo-1625231334401-3a833bf49834` | Image no longer exists on Unsplash — shows broken alt text |
| 2 | Range Rover Vogue | Range Rover Vogue (luxury SUV) | **Tesla Model 3** (white sedan) | `photo-1606016159991-dfe4f2746ad5` | Wrong vehicle — sedan instead of SUV, completely different brand |
| 3 | Lexus LX600 | Lexus LX600 (luxury SUV) | **Chevrolet Corvette C7** (modified/wrapped sports car) | `photo-1619405399517-d7fce0f13302` | Wrong vehicle — sports car instead of SUV, completely different brand |
| 4 | Toyota Land Cruiser Prado | Toyota Land Cruiser Prado (SUV) | **IMAGE BROKEN (404)** | `photo-1594611396620-b1ff516a5763` | Image no longer exists on Unsplash — shows broken alt text |
| 5 | Mercedes-Benz GLE | Mercedes-Benz GLE (mid-size SUV) | **Mercedes-AMG GT** (sports coupe) | `photo-1618843479313-40f8afb4b4d8` | Wrong model — correct brand but wrong body type (sports car vs SUV) |
| 6 | BMW 7 Series | BMW 7 Series (luxury sedan) | **BMW M3/M5** (sport sedan with aftermarket body kit) | `photo-1555215695-3004980ad54e` | Wrong model — correct brand but wrong model (M-series vs 7 Series) |
| 7 | Subaru Outback | Subaru Outback (crossover wagon) | **Elderly woman in floral blouse** (portrait photo) | `photo-1626668011687-8a114cf5a34c` | Completely wrong — not a car at all |

### Summary: 7/7 template card images are incorrect
- 2 are broken (404)
- 4 show the wrong vehicle entirely
- 1 is not even a car photo

---

## Hero / Preview Image (screen1-upload.html + screen2-studio.html)

| Location | Label | Actual Image Shows | Unsplash URL | Issue |
|----------|-------|-------------------|-------------|-------|
| Screen 1 hero background | "Luxury vehicle in dramatic lighting" | **Audi R8** (rear view, on highway) | `photo-1603584173870-7f23fdae1b7a` | Generic luxury car — acceptable as hero, but not a vehicle the shop actually wraps (Audi R8 is not in the pricing list) |
| Screen 2 vehicle preview | Default preview | Same **Audi R8** image | Same URL | Same issue — this is also the default preview before user selects a vehicle |

---

## Portfolio Gallery Images (screen1-upload.html)

These are showcase/inspiration images, not tied to specific vehicle models. The labels describe the wrap finish, not the car model. Accuracy is less critical here but still noted.

| # | Label in UI | Actual Image Shows | Unsplash URL | Notes |
|---|------------|-------------------|-------------|-------|
| 1 | "Gloss Black · Sedan" | **Ford Mustang** (dark, front view) | `photo-1494976388531-d1058494cdd8` | Acceptable — label says "Sedan", image is a muscle car/coupe |
| 2 | "Nardo Gray Matte · Sports Car" | **Bugatti Chiron** (silver/white, front view) | `photo-1544636331-e26879cd4d9b` | Car is silver/white, not "Nardo Gray Matte" |
| 3 | "Chrome Silver · Supercar" | **Porsche Panamera** (black, rear view) | `photo-1503376780353-7e6692767b70` | Car is black, not "Chrome Silver"; Panamera is a sedan, not a supercar |
| 4 | "Satin Blue · SUV" | **McLaren 720S** (white supercar) | `photo-1542362567-b07e54358753` | Wrong body type — supercar, not SUV; wrong color — white, not blue |
| 5 | "Military Green · SUV" | **BMW M4** (silver/teal coupe) | `photo-1580273916550-e323be2ae537` | Wrong body type — coupe, not SUV; wrong color — not military green |
| 6 | "Racing Red · Coupe" | **Chevrolet Camaro** (blue) | `photo-1552519507-da3b142c6e3d` | Wrong color — blue, not "Racing Red" |

### Summary: 6/6 portfolio images have at least one mismatch (color, body type, or both)

---

## Recommended Replacements

For the 7 template cards, you need actual photos of these specific vehicles:

1. **Toyota Land Cruiser V8/LC300** — Need a Toyota Land Cruiser 300 series or V8 (large SUV)
2. **Range Rover Vogue** — Need a Range Rover Vogue (luxury full-size SUV)
3. **Lexus LX600** — Need a Lexus LX600 (luxury full-size SUV)
4. **Toyota Land Cruiser Prado** — Need a Toyota Land Cruiser Prado / TX-L (mid-size SUV)
5. **Mercedes-Benz GLE** — Need a Mercedes-Benz GLE (mid-size luxury SUV)
6. **BMW 7 Series** — Need a BMW 7 Series sedan (G70 generation preferred)
7. **Subaru Outback** — Need a Subaru Outback (crossover/wagon)

For the hero image, ideally use one of the above vehicles (e.g., the Land Cruiser) or a wrapped vehicle that represents the Nairobi market.

For the portfolio gallery, match the wrap finish/color described in the label to the actual vehicle shown.
