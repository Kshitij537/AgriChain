#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 AgriChain Setup Script${NC}\n"

# Step 1: Check PostgreSQL
echo -e "${YELLOW}Step 1: Checking PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL not installed${NC}"
    echo "Install with: brew install postgresql@15"
    exit 1
fi
echo -e "${GREEN}✅ PostgreSQL found${NC}\n"

# Step 2: Start PostgreSQL
echo -e "${YELLOW}Step 2: Starting PostgreSQL service...${NC}"
brew services start postgresql@15 2>/dev/null
sleep 2
echo -e "${GREEN}✅ PostgreSQL started${NC}\n"

# Step 3: Create database
echo -e "${YELLOW}Step 3: Creating database...${NC}"
psql postgres -c "DROP DATABASE IF EXISTS agrichain_db;" 2>/dev/null
psql postgres -c "CREATE DATABASE agrichain_db;" 2>/dev/null
echo -e "${GREEN}✅ Database created${NC}\n"

# Step 4: Create tables
echo -e "${YELLOW}Step 4: Creating tables...${NC}"
cd "$(dirname "$0")/../database" 2>/dev/null
psql agrichain_db < schemas/users.sql
psql agrichain_db < schemas/farms.sql
psql agrichain_db < schemas/ndvi.sql
psql agrichain_db < schemas/ndvi_history.sql
psql agrichain_db < schemas/disease.sql
psql agrichain_db < schemas/spoilage.sql
echo -e "${GREEN}✅ Tables created${NC}\n"

# Step 5: Verify tables
echo -e "${YELLOW}Step 5: Verifying tables...${NC}"
psql agrichain_db -c "\dt" | grep -q users
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ All tables verified${NC}\n"
else
    echo -e "${RED}❌ Table creation failed${NC}"
    exit 1
fi

# Step 6: Install backend dependencies
echo -e "${YELLOW}Step 6: Installing backend dependencies...${NC}"
cd "$(dirname "$0")/../backend"
npm install
echo -e "${GREEN}✅ Backend dependencies installed${NC}\n"

echo -e "${GREEN}✅ Setup complete!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "Terminal 1: cd $(dirname "$0")/../backend && npm run dev"
echo -e "Terminal 2: cd $(dirname "$0")/../frontend && npm run dev"
