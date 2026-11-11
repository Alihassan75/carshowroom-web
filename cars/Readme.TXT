Put car pictures in this folder and they appear automatically.

File name = make, a dash, then the model. All lowercase, dashes instead of spaces.
The ending can be .jpg, .png, .webp or .jpeg (lowercase). The app tries the full model first,
then just the first word of the model.

Examples
  Toyota Fortuner        ->  toyota-fortuner.jpg
  Suzuki Cultus AGS      ->  suzuki-cultus-ags.jpg
  Honda Civic RS         ->  honda-civic-rs.jpg
  Kia Sportage Alpha     ->  kia-sportage-alpha.jpg   (or kia-sportage.png)
  Toyota Corolla Altis   ->  toyota-corolla-altis.jpg (or toyota-corolla.webp)
  Hyundai Tucson         ->  hyundai-tucson.jpg
  Suzuki Alto VXL        ->  suzuki-alto-vxl.jpg

Checks if a picture does not show:
  1. Open https://YOUR-SITE/cars/toyota-fortuner.jpg directly. If you see "Page not found", the file
     is missing, in the wrong folder, or named differently (capital letters, spaces, "(1)").
  2. The folder must be web/cars (inside the web folder), not the top level of the repo.
  3. A picture uploaded to a specific car in the dashboard always wins over a picture in this folder.
  4. Wait for Netlify to say Published, then hard-refresh (Ctrl + Shift + R).

Only use pictures you have the right to use. Keep each file under about 300 KB (about 1000 pixels wide).
