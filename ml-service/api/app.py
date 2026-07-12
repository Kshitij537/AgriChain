from fastapi import FastAPI, UploadFile, File

app = FastAPI(title="Disease Detection ML Service")

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    # TODO: Implement prediction endpoint using preprocess and predict modules
    return {"status": "scaffold", "filename": file.filename}
